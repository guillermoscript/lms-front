/**
 * Map one page op onto Puck 0.20.2 `dispatch` calls (design §3.6, critique A1/A2/A7).
 *
 * - Puck actions address items by `{index, zone}`, never by id, so every op resolves its id
 *   through `getSelectorForId` IMMEDIATELY before each dispatch — never from a cached index
 *   (earlier ops in the same frame shift indexes). A missing id/zone/type is skipped with a
 *   warning, the same totality rule as core `applyOps`.
 * - `add` = `insert{id}` (Puck merges `defaultProps`) then `replace` with the SAME id and
 *   `{...defaultProps, ...props}` (array items filled by core `applyArrayDefaults`).
 * - Every dispatch carries `recordHistory: false`; the turn records ONE history entry at the
 *   end (see turn.ts).
 * - Every dispatch is tagged as ours (`isOwnPuckAction`), so the editor's `onAction` can tell
 *   a human undo/redo mid-turn from the AI's own `setData` (critique A3).
 */
import {
  ROOT_ZONE,
  applyArrayDefaults,
  descendantIds,
  parseZone,
  resolveAppends,
  type ManifestField,
  type PageData,
  type PageOp,
} from '@lms/core'

type Props = Record<string, unknown>

export interface PuckSelector {
  index: number
  zone?: string
}

export interface PuckItem {
  type: string
  props: Props
}

export interface PuckDataLike {
  root?: { props?: Props } & Record<string, unknown>
  content: PuckItem[]
  zones?: Record<string, PuckItem[]>
}

/** The structural slice of Puck's action union this module dispatches. */
export type PuckActionLike = { type: string; recordHistory?: boolean } & Record<string, unknown>

/** The slice of `useGetPuck()()` the applier needs (the real PuckApi satisfies it). */
export interface PuckApiLike {
  appState: { data: PuckDataLike; ui?: { itemSelector?: PuckSelector | null } & Record<string, unknown> }
  config: { components: Record<string, { defaultProps?: Props; fields?: unknown } | undefined> }
  dispatch: (action: never) => void
  getSelectorForId: (id: string) => PuckSelector | undefined
  getItemBySelector: (selector: PuckSelector) => PuckItem | undefined
  selectedItem?: PuckItem | null
}

export type GetPuck = () => PuckApiLike

// ── Own-action tagging ──────────────────────────────────────────────────────────────────

const ownActions = new WeakSet<object>()
let ownDepth = 0

/**
 * True for an action the AI applier dispatched. Puck hands `onAction` the same action object
 * it was given, and calls it synchronously inside `dispatch`, so both checks hold.
 */
export function isOwnPuckAction(action: unknown): boolean {
  return ownDepth > 0 || (typeof action === 'object' && action !== null && ownActions.has(action))
}

/** Dispatch an action tagged as the applier's own. */
export function dispatchOwn(puck: PuckApiLike, action: PuckActionLike): void {
  ownActions.add(action)
  ownDepth++
  try {
    ;(puck.dispatch as (a: PuckActionLike) => void)(action)
  } finally {
    ownDepth--
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────

export interface ApplyOpResult {
  applied: boolean
  warning?: string
}

export interface ApplyOpOptions {
  /** Select (and so scroll to) blocks the AI adds or moves. Default true. */
  select?: boolean
}

const ok: ApplyOpResult = { applied: true }
const skip = (warning: string): ApplyOpResult => ({ applied: false, warning })

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(n) ? n : max)))
}

function withoutId(props: Props | undefined): Props {
  const rest = { ...(props ?? {}) }
  delete rest.id
  return rest
}

function zoneItems(data: PuckDataLike, zone: string): PuckItem[] | undefined {
  return zone === ROOT_ZONE ? data.content : data.zones?.[zone]
}

function fieldsOf(puck: PuckApiLike, type: string): Record<string, ManifestField> | undefined {
  const fields = puck.config.components[type]?.fields
  return fields && typeof fields === 'object' ? (fields as Record<string, ManifestField>) : undefined
}

function selectorZone(selector: PuckSelector): string {
  return selector.zone || ROOT_ZONE
}

/**
 * Make sure a DropZone exists before inserting into it. Puck only walks zones present in
 * `data.zones`, and a zone first appears when its DropZone mounts, which can lag behind a
 * fast stream; seeding it (when the parent block exists) lets the insert land.
 */
function ensureZone(puck: PuckApiLike, zone: string): string | null {
  if (zone === ROOT_ZONE) return null
  if (puck.appState.data.zones?.[zone]) return null
  const parent = parseZone(zone)
  if (!parent || parent.parentId === 'root' || !puck.getSelectorForId(parent.parentId)) {
    return `zone "${zone}" does not exist`
  }
  dispatchOwn(puck, {
    type: 'setData',
    data: (prev: PuckDataLike) => ({ ...prev, zones: { ...(prev.zones ?? {}), [zone]: [] } }),
    recordHistory: false,
  })
  return null
}

function select(puck: PuckApiLike, id: string): void {
  const selector = puck.getSelectorForId(id)
  if (!selector) return
  dispatchOwn(puck, { type: 'setUi', ui: { itemSelector: selector }, recordHistory: false })
  scrollToBlock(id)
}

/** Bring a block the AI just touched into view (Puck does not scroll on `setUi`). */
function scrollToBlock(id: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // The block renders after React commits this dispatch: look for it on the next frame.
  window.requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-puck-component="${CSS.escape(id)}"]`)
    if (!el) return
    // Scroll only the canvas's own scroller, vertically. `scrollIntoView` also scrolls every
    // ancestor (the canvas sideways, the window), which pushed the editor header out of view.
    const scroller = nearestVerticalScroller(el)
    if (!scroller) return
    const box = el.getBoundingClientRect()
    const view = scroller.getBoundingClientRect()
    const margin = 16
    let delta = 0
    if (box.top < view.top || box.height > view.height) delta = box.top - view.top - margin
    else if (box.bottom > view.bottom) delta = box.bottom - view.bottom + margin
    if (delta === 0) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    scroller.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' })
  })
}

function nearestVerticalScroller(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflowY = window.getComputedStyle(node).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

function clearSelection(puck: PuckApiLike): void {
  if (!puck.appState.ui?.itemSelector) return
  dispatchOwn(puck, { type: 'setUi', ui: { itemSelector: null }, recordHistory: false })
}

/** `replace` the block `id` with `props` (the id is kept; Puck refuses an id change). */
function replaceById(getPuck: GetPuck, id: string, type: string, props: Props): ApplyOpResult {
  const puck = getPuck()
  const selector = puck.getSelectorForId(id)
  if (!selector) return skip(`no block with id "${id}"`)
  dispatchOwn(puck, {
    type: 'replace',
    destinationIndex: selector.index,
    destinationZone: selectorZone(selector),
    data: { type, props: { ...props, id } },
    recordHistory: false,
  })
  return ok
}

// ── The applier ─────────────────────────────────────────────────────────────────────────

/**
 * Apply one op to the live editor. Total: never throws; a skipped op returns a warning.
 * `getPuck` is called again before every dispatch so each one sees the latest store.
 */
export function applyOpToPuck(op: PageOp, getPuck: GetPuck, opts: ApplyOpOptions = {}): ApplyOpResult {
  const shouldSelect = opts.select !== false
  try {
    switch (op.op) {
      case 'add': {
        let puck = getPuck()
        const component = puck.config.components[op.type]
        if (!component) return skip(`add: unknown block type "${op.type}"`)
        if (puck.getSelectorForId(op.id)) return skip(`add: id "${op.id}" already exists`)
        const zoneError = ensureZone(puck, op.zone)
        if (zoneError) return skip(`add: ${zoneError}`)
        puck = getPuck()
        const items = zoneItems(puck.appState.data, op.zone) ?? []
        dispatchOwn(puck, {
          type: 'insert',
          componentType: op.type,
          destinationIndex: clamp(op.index, 0, items.length),
          destinationZone: op.zone,
          id: op.id,
          recordHistory: false,
        })
        // Critique A7: same id, defaults under the op's props, array items filled.
        const props = applyArrayDefaults(
          { ...(component.defaultProps ?? {}), ...withoutId(op.props) },
          fieldsOf(puck, op.type)
        )
        const replaced = replaceById(getPuck, op.id, op.type, props)
        if (!replaced.applied) return skip(`add: ${replaced.warning}`)
        if (shouldSelect) select(getPuck(), op.id)
        return ok
      }

      case 'update': {
        const puck = getPuck()
        const selector = puck.getSelectorForId(op.id)
        const item = selector ? puck.getItemBySelector(selector) : undefined
        if (!selector || !item) return skip(`update: no block with id "${op.id}"`)
        const incoming = withoutId(op.props)
        const merged = { ...item.props, ...applyArrayDefaults(incoming, fieldsOf(puck, item.type)) }
        const { props, warnings } = resolveAppends(merged, op.appends, new Set(Object.keys(incoming)))
        const replaced = replaceById(getPuck, op.id, item.type, props)
        if (!replaced.applied) return skip(`update: ${replaced.warning}`)
        return warnings.length ? { applied: true, warning: `update "${op.id}": ${warnings.join('; ')}` } : ok
      }

      case 'updateRoot': {
        const puck = getPuck()
        const root = puck.appState.data.root ?? {}
        const incoming = { ...(op.props ?? {}) }
        const merged = { ...(root.props ?? {}), ...incoming }
        const { props, warnings } = resolveAppends(merged, op.appends, new Set(Object.keys(incoming)))
        // replaceRoot replaces the root's props wholesale, so the merge happens here first.
        dispatchOwn(puck, { type: 'replaceRoot', root: { ...root, props }, recordHistory: false })
        return warnings.length ? { applied: true, warning: `updateRoot: ${warnings.join('; ')}` } : ok
      }

      case 'move': {
        let puck = getPuck()
        if (!puck.getSelectorForId(op.id)) return skip(`move: no block with id "${op.id}"`)
        const target = parseZone(op.zone)
        if (
          op.zone !== ROOT_ZONE &&
          target &&
          (target.parentId === op.id || descendantIds(puck.appState.data as unknown as PageData, op.id).includes(target.parentId))
        ) {
          return skip(`move: cannot move "${op.id}" into its own zone`)
        }
        const zoneError = ensureZone(puck, op.zone)
        if (zoneError) return skip(`move: ${zoneError}`)
        puck = getPuck()
        const source = puck.getSelectorForId(op.id)
        if (!source) return skip(`move: no block with id "${op.id}"`)
        const sourceZone = selectorZone(source)
        const destLength = (zoneItems(puck.appState.data, op.zone) ?? []).length - (sourceZone === op.zone ? 1 : 0)
        dispatchOwn(puck, {
          type: 'move',
          sourceIndex: source.index,
          sourceZone,
          destinationIndex: clamp(op.index, 0, Math.max(0, destLength)),
          destinationZone: op.zone,
          recordHistory: false,
        })
        if (shouldSelect) select(getPuck(), op.id)
        return ok
      }

      case 'remove': {
        const puck = getPuck()
        const selector = puck.getSelectorForId(op.id)
        if (!selector) return skip(`remove: no block with id "${op.id}"`)
        // A stale selector would point the fields panel at whichever block slides into place.
        clearSelection(puck)
        dispatchOwn(getPuck(), { type: 'remove', index: selector.index, zone: selectorZone(selector), recordHistory: false })
        return ok
      }

      case 'reset': {
        const puck = getPuck()
        clearSelection(puck)
        dispatchOwn(getPuck(), {
          type: 'setData',
          data: { root: { props: { ...(op.root ?? {}) } }, content: [], zones: {} },
          recordHistory: false,
        })
        return ok
      }

      default: {
        const unknown = op as { op?: unknown }
        return skip(`unknown op "${String(unknown.op)}"`)
      }
    }
  } catch (err) {
    // Puck's reducers throw on impossible actions (e.g. an id change in replace).
    return skip(`${op.op}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
