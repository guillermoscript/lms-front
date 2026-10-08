/**
 * The client op queue (design §3.6, critique B2/H).
 *
 * Ops arrive from the stream in bursts; the queue applies them on animation frames:
 * - Every op that arrived before a frame is applied in that frame, in arrival order (one flush
 *   per `requestAnimationFrame`). Application is synchronous (Puck `dispatch`), so the queue is
 *   serial by construction: a frame never starts while another is still applying.
 * - **Typewriter** (critique B2). Some providers (Google AI Studio keys) do not stream tool
 *   input, so a block's text arrives whole. When an `add`/`update` carries a long text field and
 *   the block has not received server `appends` this turn, the queue blanks the field and
 *   re-types it with frame-paced `update{appends}` ops, so every provider looks live. It backs
 *   off when a backlog builds up (a template drop) and when the user prefers reduced motion.
 * - `drain()` resolves once everything queued so far has been applied; `close()` drops the
 *   rest (a foreign undo aborted the turn).
 */
import { isColorKey, urlKindForKey, type PageOp } from '@lms/core'

export type ApplyFn = (op: PageOp) => { applied: boolean; warning?: string }
export type RafFn = (cb: () => void) => unknown

export interface OpQueueOptions {
  apply: ApplyFn
  /** Frame scheduler; defaults to `requestAnimationFrame` (or a 16 ms timer outside a browser). */
  raf?: RafFn
  /** Re-type long text that arrived whole. Default true. */
  typewriter?: boolean
  /** Shortest text worth typing out. */
  typewriterMinChars?: number
  /** Upper bound on frames one field takes to type (~0.5 s at 60 fps). */
  typewriterMaxFrames?: number
  /** Skip the typewriter once this many ops are waiting (catch up instead). */
  typewriterMaxBacklog?: number
  onWarning?: (warning: string) => void
}

type Entry = { kind: 'op'; op: PageOp; synthetic?: boolean } | { kind: 'frame' }

const defaultRaf: RafFn = (cb) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => cb()) : setTimeout(cb, 16)

/** A top-level prop worth typing out: long, prose-like text that is not a URL, colour or id. */
export function isTypewriterText(key: string, value: unknown, minChars = 40): value is string {
  if (typeof value !== 'string' || value.length < minChars || !/\s/.test(value)) return false
  if (urlKindForKey(key) !== null || isColorKey(key)) return false
  if (key === 'id' || /Id$/.test(key) || /Ids$/.test(key)) return false
  return true
}

/** Split `text` into at most `maxFrames` chunks of at least `minChunk` characters. */
export function chunkText(text: string, maxFrames: number, minChunk = 3): string[] {
  const size = Math.max(minChunk, Math.ceil(text.length / Math.max(1, maxFrames)))
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

export class OpQueue {
  private entries: Entry[] = []
  private pumping = false
  private closed = false
  private idle: Array<() => void> = []
  /** Blocks that got server `appends` (or were typed) this turn: never type them again. */
  private live = new Set<string>()
  private readonly opts: Required<Omit<OpQueueOptions, 'onWarning'>> & Pick<OpQueueOptions, 'onWarning'>

  /** Ops that changed the page (synthetic typewriter chunks excluded). */
  applied = 0
  /** Ops skipped with a warning. */
  skipped = 0
  /** Frames flushed (for tests and diagnostics). */
  frames = 0

  constructor(options: OpQueueOptions) {
    // `??`, not a spread over defaults: callers forward their own optional options, and an
    // explicit `undefined` (PageArchitectTurn passes `raf: opts.raf`) must still get the default.
    this.opts = {
      apply: options.apply,
      onWarning: options.onWarning,
      raf: options.raf ?? defaultRaf,
      typewriter: options.typewriter ?? true,
      typewriterMinChars: options.typewriterMinChars ?? 40,
      typewriterMaxFrames: options.typewriterMaxFrames ?? 30,
      typewriterMaxBacklog: options.typewriterMaxBacklog ?? 20,
    }
  }

  get pending(): number {
    return this.entries.reduce((n, e) => n + (e.kind === 'op' ? 1 : 0), 0)
  }

  get isClosed(): boolean {
    return this.closed
  }

  push(op: PageOp): void {
    if (this.closed) return
    if (op.op === 'update' && op.appends && Object.keys(op.appends).length > 0) this.live.add(op.id)
    if (op.op === 'reset') this.live.clear()
    this.entries.push(...this.expand(op))
    this.pump()
  }

  /** Resolves when every op queued so far has been applied (or the queue was closed). */
  drain(): Promise<void> {
    if (!this.pumping && this.entries.length === 0) return Promise.resolve()
    return new Promise((resolve) => this.idle.push(resolve))
  }

  /** Drop everything still queued and refuse new ops. */
  close(): void {
    this.closed = true
    this.entries = []
    this.settle()
  }

  private expand(op: PageOp): Entry[] {
    const { typewriter, typewriterMinChars, typewriterMaxFrames, typewriterMaxBacklog } = this.opts
    if (!typewriter || (op.op !== 'add' && op.op !== 'update') || !op.props) return [{ kind: 'op', op }]
    if (this.live.has(op.id) || this.pending >= typewriterMaxBacklog) return [{ kind: 'op', op }]

    const texts = Object.entries(op.props).filter(([key, value]) => isTypewriterText(key, value, typewriterMinChars))
    if (texts.length === 0) return [{ kind: 'op', op }]
    // An op never sets a key in both props and appends: drop typed keys from its appends.
    if (op.op === 'update' && op.appends && texts.some(([key]) => key in op.appends!)) return [{ kind: 'op', op }]

    this.live.add(op.id)
    const blanked = { ...op.props }
    for (const [key] of texts) blanked[key] = ''
    const out: Entry[] = [{ kind: 'op', op: { ...op, props: blanked } as PageOp }]

    const chunks = texts.map(([key, value]) => [key, chunkText(value as string, typewriterMaxFrames)] as const)
    const frames = Math.max(...chunks.map(([, c]) => c.length))
    for (let f = 0; f < frames; f++) {
      const appends: Record<string, string> = {}
      for (const [key, c] of chunks) if (c[f] !== undefined) appends[key] = c[f]
      out.push({ kind: 'frame' }, { kind: 'op', op: { op: 'update', id: op.id, appends }, synthetic: true })
    }
    return out
  }

  private pump(): void {
    if (this.pumping || this.entries.length === 0) return
    this.pumping = true
    const step = () => {
      this.opts.raf(() => {
        this.flushFrame()
        if (this.entries.length > 0 && !this.closed) step()
        else {
          this.pumping = false
          this.settle()
        }
      })
    }
    step()
  }

  /** Apply entries up to the next frame marker. */
  private flushFrame(): void {
    this.frames++
    while (this.entries.length > 0 && !this.closed) {
      const entry = this.entries.shift()!
      if (entry.kind === 'frame') break
      const result = this.opts.apply(entry.op)
      if (result.applied) {
        if (!entry.synthetic) this.applied++
      } else {
        this.skipped++
        // A blanked add/update failed: its typed chunks have nothing to land on.
        if (!entry.synthetic && 'id' in entry.op) this.dropSynthetic(entry.op.id)
      }
      if (result.warning) this.opts.onWarning?.(result.warning)
    }
  }

  private dropSynthetic(id: string): void {
    this.entries = this.entries.filter((e) => !(e.kind === 'op' && e.synthetic && 'id' in e.op && e.op.id === id))
  }

  private settle(): void {
    if (this.pumping && !this.closed) return
    const waiting = this.idle
    this.idle = []
    for (const resolve of waiting) resolve()
  }
}
