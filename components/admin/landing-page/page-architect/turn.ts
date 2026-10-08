/**
 * One AI turn in the editor: queue → Puck, then a single history entry (design §3.6,
 * critique A3/A4).
 *
 * - Every op is dispatched with `recordHistory: false` (apply-op-to-puck.ts).
 * - `end()` drains the queue and, ONLY if at least one op applied, dispatches one
 *   `setUi` with `recordHistory: true`: Puck's history then gets a single entry holding the
 *   final state, so one Ctrl+Z reverts the whole turn (an aborted turn keeps its partial result,
 *   still one step). Puck debounces `record` by 250 ms, so `end()` waits `commitDelayMs` before
 *   resolving: the caller unlocks human edits only after the entry exists.
 * - `abortForeign()` handles a human undo/redo mid-turn (`set`/`setData` that is not ours):
 *   the history already moved, so the turn stops applying and commits NOTHING.
 */
import { pageOpSchema, type PageOp } from '@lms/core'
import { applyOpToPuck, dispatchOwn, type GetPuck } from './apply-op-to-puck'
import { OpQueue, type RafFn } from './op-queue'

export interface TurnOptions {
  getPuck: GetPuck
  raf?: RafFn
  sleep?: (ms: number) => Promise<void>
  /** Wait for Puck's debounced history record (250 ms) before resolving `end()`. */
  commitDelayMs?: number
  typewriter?: boolean
  onWarning?: (warning: string) => void
}

export interface TurnResult {
  /** Ops that changed the page. */
  applied: number
  /** A history entry was recorded for the turn. */
  committed: boolean
  /** A human undo/redo stopped the turn. */
  abortedByHistory: boolean
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class PageArchitectTurn {
  private readonly queue: OpQueue
  private ending: Promise<TurnResult> | null = null
  private foreignAbort = false
  /** The block the admin had selected when the turn began (the applier selects as it works). */
  private readonly selectedBefore: string | null

  constructor(private readonly opts: TurnOptions) {
    this.selectedBefore = selectedBlockId(opts.getPuck())
    this.queue = new OpQueue({
      apply: (op) => applyOpToPuck(op, opts.getPuck),
      raf: opts.raf,
      typewriter: opts.typewriter,
      onWarning: opts.onWarning,
    })
  }

  get applied(): number {
    return this.queue.applied
  }

  get abortedByHistory(): boolean {
    return this.foreignAbort
  }

  get isEnding(): boolean {
    return this.ending !== null
  }

  /** Queue an op from the stream. Malformed payloads are dropped with a warning. */
  push(payload: unknown): void {
    if (this.foreignAbort || this.ending) return
    const parsed = pageOpSchema.safeParse(payload)
    if (!parsed.success) {
      this.opts.onWarning?.('dropped a malformed page op')
      return
    }
    this.queue.push(parsed.data as PageOp)
  }

  /** A human undo/redo happened mid-turn: stop applying, never commit. */
  abortForeign(): void {
    this.foreignAbort = true
    this.queue.close()
  }

  /** Drain, commit one history entry if anything applied, wait for Puck to record it. */
  end(): Promise<TurnResult> {
    if (!this.ending) this.ending = this.finish()
    return this.ending
  }

  private async finish(): Promise<TurnResult> {
    await this.queue.drain()
    const applied = this.queue.applied
    if (this.foreignAbort || applied === 0) {
      return { applied, committed: false, abortedByHistory: this.foreignAbort }
    }
    // The commit entry also hands the selection back: the applier selected each block it
    // touched, and a selection left on the AI's last block would scope the admin's NEXT
    // request to it ("this", the selected-block chip) without the admin ever choosing it.
    const puck = this.opts.getPuck()
    const itemSelector = this.selectedBefore ? (puck.getSelectorForId(this.selectedBefore) ?? null) : null
    dispatchOwn(puck, { type: 'setUi', ui: { itemSelector }, recordHistory: true })
    await (this.opts.sleep ?? defaultSleep)(this.opts.commitDelayMs ?? 300)
    return { applied, committed: true, abortedByHistory: false }
  }
}

function selectedBlockId(puck: ReturnType<GetPuck>): string | null {
  const selector = puck.appState.ui?.itemSelector
  const id = selector ? puck.getItemBySelector(selector)?.props?.id : undefined
  return typeof id === 'string' ? id : null
}
