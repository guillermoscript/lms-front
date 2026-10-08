/**
 * Live token streaming for `add_block` (design §3.5 "Live streaming of text", critique B3/B4).
 *
 * The model streams a tool call's input as raw JSON text (`onInputDelta`). We do NOT use
 * `parsePartialJson`: it repairs a half-written string by closing it, so `"type":"Hero` reads
 * as a finished `"Hero"` and a half URL looks complete. Instead `PartialJsonScanner` consumes
 * the raw text incrementally (each character once, across deltas) and builds a partial tree
 * where a value is `complete` only once its container has seen the next `,` or the closing
 * bracket. Strings are decoded monotonically: a partial `\uXXXX` escape contributes nothing
 * until its four hex digits arrive, so a decoded value only ever grows.
 *
 * `AddBlockStream` turns that tree into page ops for ONE tool call (keyed by `toolCallId` in
 * `InputStreams`, because parallel calls interleave):
 *   1. once `type` is complete (and an allowed block) and `props` has started, a provisional
 *      `add` with a server id, at the parsed position or, if the position is not known yet,
 *      at the end of the page (a `move` follows once it parses);
 *   2. text/textarea fields (`catalog.streamableFields`) stream as `update{appends}` tails;
 *      the first sight of a field after the add sets it with `update{props}` (that replaces
 *      the block's placeholder default, which an append would extend);
 *   3. array items (FAQ `items[]`…): a new index emits `update{props:{items:[...skeleton]}}`,
 *      then `appends` on `items[i].field`;
 *   4. if a decoded value ever stops extending what was emitted, the field is re-sent whole
 *      (`update{props}`), never as an append.
 * URLs, ids, enums, colours and images never stream: they arrive with the final, validated
 * `update{props}` that `execute` emits (or the provisional block is removed when invalid).
 * Appends are coalesced to at most one op per `coalesceMs` per block.
 */
import {
  ROOT_ZONE,
  arrayItemSkeleton,
  isColorKey,
  urlKindForKey,
  type ManifestField,
  type PageCatalog,
  type PageOp,
} from '@lms/core'

// ── Incremental JSON scanner ───────────────────────────────────────────────────────────

export interface PartialObject {
  kind: 'object'
  entries: Map<string, PartialNode>
  complete: boolean
}
export interface PartialArray {
  kind: 'array'
  items: PartialNode[]
  complete: boolean
}
export interface PartialString {
  kind: 'string'
  /** Decoded text so far (only ever grows). */
  value: string
  /** The closing quote has been seen. */
  closed: boolean
  /** The closing quote AND the following `,` / `}` / `]` have been seen. */
  complete: boolean
}
export interface PartialScalar {
  kind: 'scalar'
  raw: string
  complete: boolean
}
export type PartialNode = PartialObject | PartialArray | PartialString | PartialScalar

interface Frame {
  node: PartialObject | PartialArray
  expect: 'key' | 'colon' | 'value' | 'delim'
  key: string
  last: PartialNode | null
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"' }
const SCALAR_CHAR = /[0-9a-zA-Z+\-.]/
const SCALAR_START = /[-0-9tfn]/
const WHITESPACE = /\s/

export class PartialJsonScanner {
  root: PartialNode | null = null
  /** The text is not JSON; the scanner stops. */
  failed = false
  private stack: Frame[] = []
  private str: { target: 'key' | 'value'; node: PartialString | null; buf: string; esc: string | null } | null = null
  private scalar: PartialScalar | null = null

  /** Feed the next chunk of raw JSON text. */
  push(text: string): void {
    for (const ch of text) {
      if (this.failed) return
      this.step(ch)
    }
  }

  private fail(): void {
    this.failed = true
  }

  private step(ch: string): void {
    if (this.str) return this.stringChar(ch)
    if (this.scalar) {
      if (SCALAR_CHAR.test(ch)) {
        this.scalar.raw += ch
        return
      }
      this.scalar = null
    }
    if (WHITESPACE.test(ch)) return
    const top = this.stack[this.stack.length - 1]
    if (!top) {
      if (this.root) return this.fail() // trailing garbage after the root value
      return this.startValue(ch, null)
    }
    switch (top.expect) {
      case 'key':
        if (ch === '"') this.str = { target: 'key', node: null, buf: '', esc: null }
        else if (ch === '}' && top.node.kind === 'object') this.close()
        else this.fail()
        return
      case 'colon':
        if (ch === ':') top.expect = 'value'
        else this.fail()
        return
      case 'value':
        if (ch === ']' && top.node.kind === 'array') this.close()
        else this.startValue(ch, top)
        return
      case 'delim':
        if (ch === ',') {
          if (top.last) top.last.complete = true
          top.expect = top.node.kind === 'object' ? 'key' : 'value'
        } else if ((ch === '}' && top.node.kind === 'object') || (ch === ']' && top.node.kind === 'array')) {
          if (top.last) top.last.complete = true
          this.close()
        } else this.fail()
        return
    }
  }

  private startValue(ch: string, frame: Frame | null): void {
    let node: PartialNode
    if (ch === '{') node = { kind: 'object', entries: new Map(), complete: false }
    else if (ch === '[') node = { kind: 'array', items: [], complete: false }
    else if (ch === '"') node = { kind: 'string', value: '', closed: false, complete: false }
    else if (SCALAR_START.test(ch)) node = { kind: 'scalar', raw: ch, complete: false }
    else return this.fail()

    if (!frame) this.root = node
    else {
      if (frame.node.kind === 'object') frame.node.entries.set(frame.key, node)
      else frame.node.items.push(node)
      frame.last = node
      frame.expect = 'delim'
    }
    if (node.kind === 'object') this.stack.push({ node, expect: 'key', key: '', last: null })
    else if (node.kind === 'array') this.stack.push({ node, expect: 'value', key: '', last: null })
    else if (node.kind === 'string') this.str = { target: 'value', node, buf: '', esc: null }
    else this.scalar = node
  }

  private close(): void {
    const frame = this.stack.pop()!
    frame.node.complete = true
  }

  private append(s: string): void {
    const st = this.str!
    if (st.target === 'key') st.buf += s
    else st.node!.value += s
  }

  private stringChar(ch: string): void {
    const st = this.str!
    if (st.esc === null) {
      if (ch === '\\') st.esc = ''
      else if (ch === '"') {
        this.str = null
        const top = this.stack[this.stack.length - 1]
        if (st.target === 'key') {
          top.key = st.buf
          top.expect = 'colon'
        } else {
          st.node!.closed = true
          // A root-level string has no container to complete it.
          if (!top) st.node!.complete = true
        }
      } else this.append(ch)
      return
    }
    if (st.esc === '') {
      if (ch === 'u') st.esc = 'u'
      else if (ch in ESCAPES) {
        st.esc = null
        this.append(ESCAPES[ch])
      } else this.fail()
      return
    }
    // \uXXXX: collect four hex digits; nothing is decoded until all four arrive.
    if (!/[0-9a-fA-F]/.test(ch)) return this.fail()
    st.esc += ch
    if (st.esc.length === 5) {
      this.append(String.fromCharCode(parseInt(st.esc.slice(1), 16)))
      st.esc = null
    }
  }
}

// ── Helpers over the partial tree ──────────────────────────────────────────────────────

export function entryOf(node: PartialNode | null | undefined, key: string): PartialNode | undefined {
  return node?.kind === 'object' ? node.entries.get(key) : undefined
}

/** A complete string value, else undefined. */
export function completeString(node: PartialNode | undefined): string | undefined {
  return node?.kind === 'string' && node.complete ? node.value : undefined
}

/** A complete integer value (number or numeric string), else undefined. */
export function completeInt(node: PartialNode | undefined): number | undefined {
  if (!node || !node.complete) return undefined
  const raw = node.kind === 'scalar' ? node.raw : node.kind === 'string' ? node.value : undefined
  if (raw === undefined || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) ? n : undefined
}

// ── add_block streaming ────────────────────────────────────────────────────────────────

/** Where a block goes, as parsed from the tool input (all optional). */
export interface PositionInput {
  after_id?: string
  index?: number
  zone?: string
}

export interface Placement {
  zone: string
  index: number
}

/** What a stream needs from the page (implemented over the shadow page in edit-tools.ts). */
export interface StreamTarget {
  catalog: PageCatalog
  newId(type: string): string
  /**
   * Resolve a position against the current page, ignoring `excludeId` (the block being
   * placed). Returns null when it cannot be resolved (unknown after_id/zone).
   */
  resolve(position: PositionInput, excludeId?: string): Placement | null
  /** Where a block currently is, or null. */
  locate(id: string): Placement | null
  /**
   * Apply an op to the shadow page and send it to the editor. Returns false when the op was
   * refused (budget spent, or it did not apply); the stream then stops.
   */
  emit(op: PageOp): boolean
}

export interface AddBlockStreamOptions {
  /** Min ms between two append flushes for this block. 0 = flush on every delta. */
  coalesceMs?: number
  now?: () => number
}

/** The streamable parts of a block type: top-level text fields and array text sub-fields. */
export interface StreamPlan {
  text: string[]
  arrays: Array<{ key: string; field: ManifestField; subs: string[] }>
}

export function streamPlanFor(catalog: PageCatalog, type: string): StreamPlan {
  const entry = catalog.entry(type)
  if (!entry) return { text: [], arrays: [] }
  const arrays: StreamPlan['arrays'] = []
  for (const [key, field] of Object.entries(entry.fields)) {
    if (field.type !== 'array') continue
    const ai = entry.ai?.fields?.[key]
    if (ai?.ref || ai?.stream === false) continue
    const subs = Object.entries(field.arrayFields ?? {})
      .filter(([sub, f]) => {
        if (f.type !== 'text' && f.type !== 'textarea') return false
        if (entry.ai?.fields?.[`${key}.${sub}`]?.stream === false) return false
        return !urlKindForKey(sub) && !isColorKey(sub)
      })
      .map(([sub]) => sub)
    if (subs.length) arrays.push({ key, field, subs })
  }
  return { text: catalog.streamableFields(type), arrays }
}

export interface StreamResult {
  /** The provisional block's id, when one was added. */
  blockId: string | null
  type: string | null
}

export class AddBlockStream {
  private readonly scanner = new PartialJsonScanner()
  /** propsJson mode: the inner scanner fed with the decoded `propsJson` string. */
  private inner: PartialJsonScanner | null = null
  private innerFed = 0
  private readonly coalesceMs: number
  private readonly now: () => number

  private blockId: string | null = null
  private type: string | null = null
  private plan: StreamPlan | null = null
  private stopped = false
  private placedFor: string | null = null
  /** Path (`title`, `items[2].answer`) → text the editor already has. */
  private readonly emitted = new Map<string, string>()
  private readonly arrayLens = new Map<string, number>()
  private pending: Record<string, string> = {}
  private lastFlush = 0

  constructor(
    private readonly target: StreamTarget,
    opts: AddBlockStreamOptions = {}
  ) {
    this.coalesceMs = opts.coalesceMs ?? 50
    this.now = opts.now ?? Date.now
  }

  push(delta: string): void {
    if (this.stopped) return
    this.scanner.push(delta)
    if (this.scanner.failed) return this.stop()
    try {
      this.step()
    } catch {
      // Streaming is best effort: the final execute() is authoritative.
      this.stop()
    }
  }

  /** Stop streaming (input complete or aborted). Pending appends are dropped: execute's final update carries every field. */
  finish(): StreamResult {
    this.stopped = true
    this.pending = {}
    return { blockId: this.blockId, type: this.type }
  }

  private stop(): void {
    this.stopped = true
    this.pending = {}
  }

  private emit(op: PageOp): boolean {
    if (this.target.emit(op)) return true
    this.stop()
    return false
  }

  private propsNode(): PartialNode | undefined {
    const root = this.scanner.root
    const props = entryOf(root, 'props')
    if (props) return props
    const json = entryOf(root, 'propsJson')
    if (json?.kind !== 'string') return undefined
    if (!this.inner) this.inner = new PartialJsonScanner()
    if (json.value.length > this.innerFed) {
      this.inner.push(json.value.slice(this.innerFed))
      this.innerFed = json.value.length
    }
    return this.inner.failed ? undefined : (this.inner.root ?? undefined)
  }

  private position(): { position: PositionInput; known: boolean } {
    const root = this.scanner.root
    const position: PositionInput = {}
    let known = true
    for (const key of ['after_id', 'index', 'zone'] as const) {
      const node = entryOf(root, key)
      if (!node) continue
      if (!node.complete) {
        known = false
        continue
      }
      if (key === 'index') {
        const n = completeInt(node)
        if (n !== undefined) position.index = n
      } else if (node.kind === 'string' && node.value) position[key] = node.value
    }
    // after_id wins over zone/index, so a complete after_id is enough.
    if (position.after_id) return { position: { after_id: position.after_id }, known: true }
    return { position, known }
  }

  private step(): void {
    const root = this.scanner.root
    if (root?.kind !== 'object' || root.complete) return // a complete input goes straight to execute()

    if (!this.blockId) {
      const type = completeString(entryOf(root, 'type'))
      if (!type || !this.target.catalog.isAllowed(type)) return
      const props = this.propsNode()
      if (!props) return // wait for props: by schema order the position comes first
      this.type = type
      this.plan = streamPlanFor(this.target.catalog, type)
      const { position, known } = this.position()
      const placement =
        (known ? this.target.resolve(position) : null) ?? this.target.resolve({ zone: ROOT_ZONE, index: Number.MAX_SAFE_INTEGER })
      if (!placement) return this.stop()
      const id = this.target.newId(type)
      const initial: Record<string, unknown> = {}
      this.collect(props, initial, true)
      if (!this.emit({ op: 'add', id, type, zone: placement.zone, index: placement.index, props: initial })) return
      this.blockId = id
      this.placedFor = known ? JSON.stringify(position) : null
      this.lastFlush = this.now()
      return
    }

    // Reposition once the position parses (it may arrive after props started).
    const { position, known } = this.position()
    const key = JSON.stringify(position)
    if (known && key !== this.placedFor && Object.keys(position).length) {
      this.placedFor = key
      const want = this.target.resolve(position, this.blockId)
      const have = this.target.locate(this.blockId)
      if (want && have && (want.zone !== have.zone || want.index !== have.index)) {
        this.flush()
        if (!this.emit({ op: 'move', id: this.blockId, zone: want.zone, index: want.index })) return
      }
    }

    const props = this.propsNode()
    if (!props) return
    const structural: Record<string, unknown> = {}
    this.collect(props, structural, false)
    if (Object.keys(structural).length) {
      this.flush()
      if (!this.emit({ op: 'update', id: this.blockId, props: structural })) return
      this.lastFlush = this.now()
    } else if (this.now() - this.lastFlush >= this.coalesceMs) {
      this.flush()
    }
  }

  /**
   * Walk the streamable fields. New fields / array growth / non-prefix changes go into
   * `structural` (sent as props); plain growth becomes a pending append.
   */
  private collect(props: PartialNode, structural: Record<string, unknown>, initial: boolean): void {
    if (props.kind !== 'object' || !this.plan) return
    for (const key of this.plan.text) {
      const node = props.entries.get(key)
      if (node?.kind !== 'string') continue
      this.track(key, node.value, () => {
        structural[key] = node.value
      }, initial)
    }
    for (const { key, field, subs } of this.plan.arrays) {
      const node = props.entries.get(key)
      if (node?.kind !== 'array') continue
      const items = node.items
      const known = this.arrayLens.get(key) ?? 0
      let rebuild = items.length > known
      if (!rebuild) {
        // Same length: append to each streamed sub-field; a non-prefix change rebuilds the list.
        items.forEach((item, i) => {
          for (const sub of subs) {
            const s = entryOf(item, sub)
            if (s?.kind !== 'string') continue
            const path = `${key}[${i}].${sub}`
            this.track(path, s.value, () => {
              rebuild = true
            }, false)
          }
        })
      }
      if (rebuild) {
        // Drop pending appends under this key: the rebuilt list carries the current text.
        for (const p of Object.keys(this.pending)) if (p.startsWith(`${key}[`)) delete this.pending[p]
        structural[key] = items.map((item, i) => {
          const out = arrayItemSkeleton(field)
          for (const sub of subs) {
            const s = entryOf(item, sub)
            const text = s?.kind === 'string' ? s.value : ''
            out[sub] = text
            this.emitted.set(`${key}[${i}].${sub}`, text)
          }
          return out
        })
        this.arrayLens.set(key, items.length)
      }
    }
  }

  /** Decide how `path`'s new text reaches the editor. */
  private track(path: string, value: string, whole: () => void, initial: boolean): void {
    const sent = this.emitted.get(path)
    if (sent === undefined || initial) {
      whole()
      this.emitted.set(path, value)
      return
    }
    if (value === sent) return
    if (value.startsWith(sent)) {
      this.pending[path] = (this.pending[path] ?? '') + value.slice(sent.length)
      this.emitted.set(path, value)
      return
    }
    // A repaired prefix or a decoded escape changed earlier text: send it whole (B3).
    delete this.pending[path]
    whole()
    this.emitted.set(path, value)
  }

  private flush(): void {
    if (!this.blockId || !Object.keys(this.pending).length) return
    const appends = this.pending
    this.pending = {}
    this.lastFlush = this.now()
    this.emit({ op: 'update', id: this.blockId, appends })
  }
}

/** One `AddBlockStream` per in-flight tool call. */
export class InputStreams {
  private readonly streams = new Map<string, AddBlockStream>()

  constructor(
    private readonly target: StreamTarget,
    private readonly opts: AddBlockStreamOptions = {}
  ) {}

  start(toolCallId: string): void {
    this.streams.set(toolCallId, new AddBlockStream(this.target, this.opts))
  }

  delta(toolCallId: string, text: string): void {
    let s = this.streams.get(toolCallId)
    if (!s) {
      s = new AddBlockStream(this.target, this.opts)
      this.streams.set(toolCallId, s)
    }
    s.push(text)
  }

  /**
   * End every stream still open and return the provisional blocks they placed. A stream
   * left open after its step finished belongs to a call whose `execute` never ran (the SDK
   * skips an invalid call, or one cut off by finishReason `length`), so its block is an orphan.
   */
  abandon(): string[] {
    const ids: string[] = []
    for (const s of this.streams.values()) {
      const r = s.finish()
      if (r.blockId) ids.push(r.blockId)
    }
    this.streams.clear()
    return ids
  }

  /** End a call's stream and return what it placed (null when it never streamed). */
  take(toolCallId: string): StreamResult | null {
    const s = this.streams.get(toolCallId)
    if (!s) return null
    this.streams.delete(toolCallId)
    return s.finish()
  }
}
