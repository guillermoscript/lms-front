/**
 * Page Architect client applier + turn lifecycle (WP2, design §3.6, critique A1–A4/A7).
 *
 * A fake `getPuck` models Puck 0.20.2's store just enough: index/zone-addressed actions,
 * `replace` refusing an id change, `insert` merging `defaultProps`, history recorded per the
 * same rule as Puck's `storeInterceptor` (`recordHistory` ?? not setData/setUi/set), and
 * `onAction` called synchronously inside `dispatch`. It records every dispatch so the tests
 * can assert `recordHistory: false` on every op and exactly one recorded commit per turn.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { applyOps, ROOT_ZONE, type OpsCatalog, type PageData, type PageOp } from '@lms/core'
import {
  applyOpToPuck,
  dispatchOwn,
  isOwnPuckAction,
  type PuckApiLike,
  type PuckItem,
} from '@/components/admin/landing-page/page-architect/apply-op-to-puck'
import { isForeignHistoryAction } from '@/components/admin/landing-page/page-architect/page-architect-context'
import { PageArchitectTurn } from '@/components/admin/landing-page/page-architect/turn'

type Props = Record<string, unknown>
type Action = { type: string; recordHistory?: boolean } & Record<string, unknown>

const COMPONENTS = {
  HeroBlock: {
    defaultProps: { title: 'Welcome', subtitle: 'Default subtitle', alignment: 'center' },
    fields: { title: { type: 'text' }, subtitle: { type: 'textarea' }, alignment: { type: 'radio' } },
  },
  FaqAccordion: {
    defaultProps: { title: 'FAQ', items: [] },
    fields: {
      title: { type: 'text' },
      items: {
        type: 'array',
        arrayFields: { question: { type: 'text' }, answer: { type: 'textarea' } },
        defaultItemProps: { question: 'Question?', answer: 'Answer here.' },
      },
    },
  },
  Columns: { defaultProps: { columnCount: '2' }, fields: { columnCount: { type: 'select' } } },
  TextBlock: { defaultProps: { content: '' }, fields: { content: { type: 'textarea' } } },
}

const catalog: OpsCatalog = {
  has: (type) => type in COMPONENTS,
  defaultProps: (type) => structuredClone(COMPONENTS[type as keyof typeof COMPONENTS]?.defaultProps ?? {}),
  fields: (type) => COMPONENTS[type as keyof typeof COMPONENTS]?.fields as never,
}

const NO_HISTORY = ['registerZone', 'unregisterZone', 'setData', 'setUi', 'set']

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function createFakePuck(initial: PageData, onAction?: (action: Action) => void) {
  let data: PageData = clone(initial)
  let ui: { itemSelector: { index: number; zone?: string } | null } = { itemSelector: null }
  const dispatched: Action[] = []
  const histories: PageData[] = [clone(data)]
  let historyIndex = 0

  const zoneOf = (zone: string): PuckItem[] | undefined => (zone === ROOT_ZONE ? data.content : data.zones?.[zone]) as PuckItem[] | undefined
  const setZone = (zone: string, items: PuckItem[]) => {
    if (zone === ROOT_ZONE) data.content = items as PageData['content']
    else data.zones = { ...(data.zones ?? {}), [zone]: items as PageData['content'] }
  }
  const selectorFor = (id: string) => {
    for (const zone of [ROOT_ZONE, ...Object.keys(data.zones ?? {})]) {
      const index = (zoneOf(zone) ?? []).findIndex((item) => item.props.id === id)
      if (index >= 0) return { index, zone }
    }
    return undefined
  }
  const itemAt = (sel: { index: number; zone?: string }) => zoneOf(sel.zone ?? ROOT_ZONE)?.[sel.index]

  function reduce(action: Action) {
    switch (action.type) {
      case 'insert': {
        const zone = action.destinationZone as string
        const items = zoneOf(zone)
        if (!items) return // Puck only walks zones present in data
        const type = action.componentType as keyof typeof COMPONENTS
        const next = items.slice()
        next.splice(action.destinationIndex as number, 0, {
          type,
          props: { ...clone(COMPONENTS[type].defaultProps), id: action.id as string },
        })
        setZone(zone, next)
        return
      }
      case 'replace': {
        const zone = action.destinationZone as string
        const next = (zoneOf(zone) ?? []).slice()
        const current = next[action.destinationIndex as number]
        const incoming = action.data as PuckItem
        if (!current || current.props.id !== incoming.props.id) {
          throw new Error("Can't change the id during a replace action.")
        }
        next[action.destinationIndex as number] = clone(incoming)
        setZone(zone, next)
        return
      }
      case 'replaceRoot': {
        const root = action.root as { props: Props }
        data.root = { ...(data.root ?? {}), props: { ...(data.root?.props ?? {}), ...clone(root.props) } }
        return
      }
      case 'move': {
        const source = (zoneOf(action.sourceZone as string) ?? []).slice()
        const [item] = source.splice(action.sourceIndex as number, 1)
        setZone(action.sourceZone as string, source)
        const dest = (zoneOf(action.destinationZone as string) ?? []).slice()
        dest.splice(action.destinationIndex as number, 0, item)
        setZone(action.destinationZone as string, dest)
        return
      }
      case 'remove': {
        const next = (zoneOf(action.zone as string) ?? []).slice()
        const [gone] = next.splice(action.index as number, 1)
        setZone(action.zone as string, next)
        for (const key of Object.keys(data.zones ?? {})) {
          if (key.startsWith(`${gone.props.id}:`)) delete data.zones![key]
        }
        return
      }
      case 'setData': {
        const patch = typeof action.data === 'function' ? (action.data as (d: PageData) => Partial<PageData>)(data) : action.data
        data = { ...data, ...clone(patch as Partial<PageData>) }
        return
      }
      case 'setUi': {
        ui = { ...ui, ...(action.ui as object) }
        return
      }
      case 'set': {
        data = clone((action.state as { data: PageData }).data)
        return
      }
    }
  }

  const api: PuckApiLike & { history: { back: () => void } } = {
    get appState() {
      return { data: data as never, ui }
    },
    config: { components: COMPONENTS },
    dispatch: ((action: Action) => {
      dispatched.push(action)
      data = clone(data)
      reduce(action)
      const record = action.recordHistory ?? !NO_HISTORY.includes(action.type)
      if (record) {
        histories.splice(historyIndex + 1)
        histories.push(clone(data))
        historyIndex = histories.length - 1
      }
      onAction?.(action)
    }) as never,
    getSelectorForId: selectorFor,
    getItemBySelector: itemAt as never,
    get selectedItem() {
      return ui.itemSelector ? (itemAt(ui.itemSelector) ?? null) : null
    },
    history: {
      // Puck's history.back(): dispatch `set` to the previous entry (no recordHistory flag).
      back: () => {
        if (historyIndex === 0) return
        historyIndex--
        api.dispatch({ type: 'set', state: { data: clone(histories[historyIndex]) } } as never)
      },
    },
  }

  return {
    getPuck: () => api,
    get data() {
      return data
    },
    dispatched,
    histories: () => histories.slice(0, historyIndex + 1),
    get ui() {
      return ui
    },
  }
}

const page = (content: PageData['content'] = [], zones: PageData['zones'] = {}): PageData => ({
  root: { props: { metaTitle: 'Old' } },
  content,
  zones,
})
const hero = (id: string, props: Props = {}) => ({ type: 'HeroBlock', props: { id, title: 'T', subtitle: 'S', alignment: 'center', ...props } })

describe('applyOpToPuck: op → Puck action mapping', () => {
  it('add = insert{id} then replace with the SAME id and {...defaultProps, ...props}, then select', () => {
    const puck = createFakePuck(page([hero('h1')]))
    const r = applyOpToPuck(
      { op: 'add', id: 'HeroBlock-new', type: 'HeroBlock', zone: ROOT_ZONE, index: 1, props: { title: 'Hello', id: 'ignored' } },
      puck.getPuck
    )
    expect(r).toEqual({ applied: true })
    expect(puck.dispatched.map((a) => a.type)).toEqual(['insert', 'replace', 'setUi'])
    expect(puck.dispatched[0]).toMatchObject({ componentType: 'HeroBlock', destinationIndex: 1, destinationZone: ROOT_ZONE, id: 'HeroBlock-new' })
    expect(puck.dispatched[1]).toMatchObject({
      destinationIndex: 1,
      destinationZone: ROOT_ZONE,
      data: { type: 'HeroBlock', props: { id: 'HeroBlock-new', title: 'Hello', subtitle: 'Default subtitle', alignment: 'center' } },
    })
    expect(puck.ui.itemSelector).toEqual({ index: 1, zone: ROOT_ZONE })
    expect(puck.dispatched.every((a) => a.recordHistory === false)).toBe(true)
  })

  it('fills array items with neutral defaults (never the placeholder text)', () => {
    const puck = createFakePuck(page())
    applyOpToPuck(
      { op: 'add', id: 'faq', type: 'FaqAccordion', zone: ROOT_ZONE, index: 0, props: { items: [{ question: 'Q1' }] } },
      puck.getPuck
    )
    expect(puck.data.content[0].props.items).toEqual([{ question: 'Q1', answer: '' }])
  })

  it('resolves the id → selector right before each dispatch (indexes shift between ops)', () => {
    const puck = createFakePuck(page([hero('a'), hero('b')]))
    applyOpToPuck({ op: 'add', id: 'z', type: 'HeroBlock', zone: ROOT_ZONE, index: 0, props: {} }, puck.getPuck)
    puck.dispatched.length = 0
    applyOpToPuck({ op: 'update', id: 'b', props: { title: 'B!' } }, puck.getPuck)
    expect(puck.dispatched[0]).toMatchObject({ type: 'replace', destinationIndex: 2, destinationZone: ROOT_ZONE })
    expect(puck.data.content.map((i) => i.props.title)).toEqual(['Welcome', 'T', 'B!'])
  })

  it('update applies appends after the props merge and keeps the id', () => {
    const puck = createFakePuck(page([{ type: 'FaqAccordion', props: { id: 'f', title: 'FAQ', items: [{ question: 'Q', answer: 'A' }] } }]))
    const r = applyOpToPuck({ op: 'update', id: 'f', appends: { title: ' (2026)', 'items[0].answer': 'nswer' } }, puck.getPuck)
    expect(r.applied).toBe(true)
    expect(puck.data.content[0].props).toMatchObject({ id: 'f', title: 'FAQ (2026)', items: [{ question: 'Q', answer: 'Answer' }] })
  })

  it('updateRoot merges into the current root props before replaceRoot', () => {
    const puck = createFakePuck(page())
    applyOpToPuck({ op: 'updateRoot', props: { metaDescription: 'D' }, appends: { metaTitle: ' page' } }, puck.getPuck)
    expect(puck.dispatched[0]).toMatchObject({ type: 'replaceRoot', root: { props: { metaTitle: 'Old page', metaDescription: 'D' } } })
  })

  it('move / remove / reset address items by index and zone', () => {
    const puck = createFakePuck(page([hero('a'), hero('b'), hero('c')]))
    applyOpToPuck({ op: 'move', id: 'a', zone: ROOT_ZONE, index: 2 }, puck.getPuck)
    expect(puck.data.content.map((i) => i.props.id)).toEqual(['b', 'c', 'a'])
    expect(puck.dispatched.find((a) => a.type === 'move')).toMatchObject({ sourceIndex: 0, destinationIndex: 2 })

    applyOpToPuck({ op: 'remove', id: 'c' }, puck.getPuck)
    expect(puck.data.content.map((i) => i.props.id)).toEqual(['b', 'a'])

    applyOpToPuck({ op: 'reset', root: { metaTitle: 'New' } }, puck.getPuck)
    expect(puck.data).toMatchObject({ content: [], zones: {}, root: { props: { metaTitle: 'New' } } })
    expect(puck.dispatched.every((a) => a.recordHistory === false)).toBe(true)
  })

  it('adds into a nested DropZone, seeding the zone when its DropZone has not mounted yet', () => {
    const puck = createFakePuck(page([{ type: 'Columns', props: { id: 'cols', columnCount: '2' } }]))
    const r = applyOpToPuck(
      { op: 'add', id: 't1', type: 'TextBlock', zone: 'cols:column-0', index: 0, props: { content: 'Nested' } },
      puck.getPuck
    )
    expect(r.applied).toBe(true)
    expect(puck.dispatched.map((a) => a.type)).toEqual(['setData', 'insert', 'replace', 'setUi'])
    expect(puck.data.zones?.['cols:column-0']?.[0].props).toMatchObject({ id: 't1', content: 'Nested' })
    // …and nested blocks are addressable afterwards.
    applyOpToPuck({ op: 'update', id: 't1', props: { content: 'Edited' } }, puck.getPuck)
    expect(puck.data.zones?.['cols:column-0']?.[0].props.content).toBe('Edited')
  })

  it('skips (never throws) on unknown types, ids and zones', () => {
    const puck = createFakePuck(page([hero('a')]))
    expect(applyOpToPuck({ op: 'add', id: 'x', type: 'Nope', zone: ROOT_ZONE, index: 0, props: {} }, puck.getPuck).applied).toBe(false)
    expect(applyOpToPuck({ op: 'add', id: 'a', type: 'HeroBlock', zone: ROOT_ZONE, index: 0, props: {} }, puck.getPuck).applied).toBe(false)
    expect(applyOpToPuck({ op: 'update', id: 'ghost', props: {} }, puck.getPuck).applied).toBe(false)
    expect(applyOpToPuck({ op: 'remove', id: 'ghost' }, puck.getPuck).applied).toBe(false)
    expect(applyOpToPuck({ op: 'add', id: 'y', type: 'TextBlock', zone: 'ghost:zone', index: 0, props: {} }, puck.getPuck).applied).toBe(false)
    expect(applyOpToPuck({ op: 'move', id: 'a', zone: 'a:inner', index: 0 }, puck.getPuck).applied).toBe(false)
    expect(puck.dispatched).toHaveLength(0)
  })

  it('ends in the same page as core applyOps for the same op sequence', () => {
    const initial = page([hero('a'), { type: 'Columns', props: { id: 'cols', columnCount: '2' } }], { 'cols:column-0': [] })
    const ops: PageOp[] = [
      { op: 'add', id: 'f', type: 'FaqAccordion', zone: ROOT_ZONE, index: 1, props: { items: [{ question: 'Q' }] } },
      { op: 'update', id: 'f', appends: { 'items[0].answer': 'Yes.' } },
      { op: 'add', id: 't', type: 'TextBlock', zone: 'cols:column-0', index: 0, props: { content: 'x' } },
      { op: 'move', id: 'a', zone: ROOT_ZONE, index: 5 },
      { op: 'update', id: 'a', props: { title: 'Moved' } },
      { op: 'updateRoot', props: { metaTitle: 'New' } },
      { op: 'remove', id: 'cols' },
    ]
    const puck = createFakePuck(initial)
    for (const op of ops) expect(applyOpToPuck(op, puck.getPuck).applied).toBe(true)
    const expected = applyOps(initial, ops, catalog)
    expect(expected.warnings).toEqual([])
    expect(puck.data.content).toEqual(expected.data.content)
    expect(puck.data.root).toEqual(expected.data.root)
    expect(puck.data.zones).toEqual(expected.data.zones)
  })
})

describe('own-action tagging (critique A3)', () => {
  it("marks the applier's dispatches as own while onAction runs, and nothing else", () => {
    const seen: Array<{ type: string; own: boolean; foreign: boolean }> = []
    const puck = createFakePuck(page([hero('a')]), (action) =>
      seen.push({ type: action.type, own: isOwnPuckAction(action), foreign: isForeignHistoryAction(action) })
    )
    dispatchOwn(puck.getPuck(), { type: 'setData', data: { content: [] }, recordHistory: false })
    puck.getPuck().dispatch({ type: 'set', state: { data: page() } } as never)
    puck.getPuck().dispatch({ type: 'setData', data: { content: [] } } as never)
    puck.getPuck().dispatch({ type: 'setUi', ui: { itemSelector: null } } as never)
    expect(seen).toEqual([
      { type: 'setData', own: true, foreign: false },
      { type: 'set', own: false, foreign: true },
      { type: 'setData', own: false, foreign: true },
      { type: 'setUi', own: false, foreign: false },
    ])
  })
})

describe('PageArchitectTurn: one history entry per turn (critique A3/A4)', () => {
  let frames: Array<() => void>
  const raf = (cb: () => void) => frames.push(cb)
  const runFrames = () => {
    while (frames.length) frames.shift()!()
  }
  const sleeps: number[] = []
  const sleep = async (ms: number) => {
    sleeps.push(ms)
  }

  beforeEach(() => {
    frames = []
    sleeps.length = 0
  })

  it('applies every op with recordHistory:false and commits exactly one recordHistory:true entry', async () => {
    const puck = createFakePuck(page([hero('a')]))
    const turn = new PageArchitectTurn({ getPuck: puck.getPuck, raf, sleep, typewriter: false })
    const historyBefore = puck.histories().length

    turn.push({ op: 'add', id: 'f', type: 'FaqAccordion', zone: ROOT_ZONE, index: 1, props: { title: 'Questions' } })
    turn.push({ op: 'update', id: 'a', props: { title: 'New hero' } })
    turn.push({ op: 'update', id: 'f', appends: { title: '?' } })
    runFrames()
    const ending = turn.end()
    runFrames()
    const result = await ending

    expect(result).toEqual({ applied: 3, committed: true, abortedByHistory: false })
    const recorded = puck.dispatched.filter((a) => a.recordHistory === true)
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ type: 'setUi' })
    expect(puck.dispatched.at(-1)).toBe(recorded[0]) // the commit is the last dispatch
    expect(puck.dispatched.slice(0, -1).every((a) => a.recordHistory === false)).toBe(true)
    // Exactly one new history entry, holding the final state…
    expect(puck.histories()).toHaveLength(historyBefore + 1)
    expect(puck.histories().at(-1)!.content.map((i) => i.props.title)).toEqual(['New hero', 'Questions?'])
    // …and it waited for Puck's 250 ms debounced record before resolving.
    expect(sleeps[0]).toBeGreaterThanOrEqual(250)

    // One undo reverts the whole turn.
    puck.getPuck().history.back()
    expect(puck.data.content.map((i) => i.props.id)).toEqual(['a'])
    expect(puck.data.content[0].props.title).toBe('T')
  })

  it('the commit hands the selection back to the block the admin had selected (live QA)', async () => {
    const puck = createFakePuck(page([hero('a'), hero('b')]))
    puck.getPuck().dispatch({ type: 'setUi', ui: { itemSelector: { index: 1, zone: ROOT_ZONE } } } as never)
    const turn = new PageArchitectTurn({ getPuck: puck.getPuck, raf, sleep, typewriter: false })
    // The AI adds a block ABOVE the selection (shifting its index) and selects what it touches.
    turn.push({ op: 'add', id: 'f', type: 'FaqAccordion', zone: ROOT_ZONE, index: 0, props: {} })
    runFrames()
    expect(puck.ui.itemSelector).toEqual({ index: 0, zone: ROOT_ZONE })
    const ending = turn.end()
    runFrames()
    await ending
    expect(puck.ui.itemSelector).toEqual({ index: 2, zone: ROOT_ZONE }) // 'b', at its new index
  })

  it('with nothing selected before the turn, the commit clears the AI\'s selection', async () => {
    const puck = createFakePuck(page([hero('a')]))
    const turn = new PageArchitectTurn({ getPuck: puck.getPuck, raf, sleep, typewriter: false })
    turn.push({ op: 'add', id: 'f', type: 'FaqAccordion', zone: ROOT_ZONE, index: 1, props: {} })
    runFrames()
    const ending = turn.end()
    runFrames()
    await ending
    expect(puck.ui.itemSelector).toBeNull()
  })

  it('a chat-only turn (no ops applied) records nothing', async () => {
    const puck = createFakePuck(page([hero('a')]))
    const turn = new PageArchitectTurn({ getPuck: puck.getPuck, raf, sleep })
    turn.push({ op: 'update', id: 'ghost', props: { title: 'x' } }) // skipped
    turn.push({ not: 'an op' }) // malformed, dropped
    runFrames()
    const result = await turn.end()
    expect(result).toEqual({ applied: 0, committed: false, abortedByHistory: false })
    expect(puck.dispatched.filter((a) => a.recordHistory === true)).toHaveLength(0)
  })

  it('an aborted (stopped) turn keeps its partial result as one undo step', async () => {
    const puck = createFakePuck(page([hero('a')]))
    const turn = new PageArchitectTurn({ getPuck: puck.getPuck, raf, sleep, typewriter: false })
    turn.push({ op: 'update', id: 'a', props: { title: 'Partial' } })
    runFrames()
    // The user pressed Stop: the stream ends early, end() runs as usual.
    const result = await turn.end()
    expect(result.committed).toBe(true)
    expect(puck.data.content[0].props.title).toBe('Partial')
    puck.getPuck().history.back()
    expect(puck.data.content[0].props.title).toBe('T')
  })

  it('a foreign undo mid-turn aborts: remaining ops are dropped and nothing is committed', async () => {
    let turn: PageArchitectTurn | null = null
    const puck = createFakePuck(page([hero('a')]), (action) => {
      if (isForeignHistoryAction(action)) turn?.abortForeign()
    })
    // A human edit before the turn, so there is something to undo to.
    puck.getPuck().dispatch({ type: 'replace', destinationIndex: 0, destinationZone: ROOT_ZONE, data: hero('a', { title: 'Human' }) } as never)
    const t = new PageArchitectTurn({ getPuck: puck.getPuck, raf, sleep, typewriter: false })
    turn = t
    t.push({ op: 'update', id: 'a', props: { title: 'AI 1' } })
    runFrames()
    t.push({ op: 'add', id: 'f', type: 'FaqAccordion', zone: ROOT_ZONE, index: 1, props: {} })

    // Ctrl+Z / the header Undo button: Puck dispatches `set` to the previous entry.
    puck.getPuck().history.back()
    runFrames()
    const result = await t.end()

    expect(result).toEqual({ applied: 1, committed: false, abortedByHistory: true })
    expect(puck.dispatched.filter((a) => a.recordHistory === true)).toHaveLength(0)
    expect(puck.data.content.map((i) => i.props.id)).toEqual(['a']) // the queued add never landed
    t.push({ op: 'remove', id: 'a' })
    runFrames()
    expect(puck.data.content).toHaveLength(1)
  })

  it('end() is idempotent', async () => {
    const puck = createFakePuck(page([hero('a')]))
    const turn = new PageArchitectTurn({ getPuck: puck.getPuck, raf, sleep, typewriter: false })
    turn.push({ op: 'update', id: 'a', props: { title: 'x' } })
    runFrames()
    const [r1, r2] = await Promise.all([turn.end(), turn.end()])
    expect(r1).toBe(r2)
    expect(puck.dispatched.filter((a) => a.recordHistory === true)).toHaveLength(1)
  })
})
