/**
 * Page Architect live streaming (design §3.5, critique B3/B4): the raw-text scanner decides
 * completeness itself, and an add_block delta sequence turns into the expected op sequence —
 * provisional add, appends, array skeletons, a move once the position parses, then the final
 * validated update (or a remove when the input turns out invalid).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ROOT_ZONE, pageCatalog, type PageData, type PageOp } from '@lms/core'
import { PartialJsonScanner, completeInt, completeString, entryOf } from '@/lib/page-builder/partial-stream'
import { OpSink, ShadowPage, createEditTools } from '@/lib/page-builder/edit-tools'

// ── scanner ──────────────────────────────────────────────────────────────────────────

describe('PartialJsonScanner', () => {
  it('a half-streamed string is not complete until the delimiter after its closing quote', () => {
    const s = new PartialJsonScanner()
    s.push('{"type":"Hero')
    const type = entryOf(s.root, 'type')
    expect(type).toMatchObject({ kind: 'string', value: 'Hero', complete: false })
    expect(completeString(type)).toBeUndefined()
    s.push('Block"')
    expect(entryOf(s.root, 'type')).toMatchObject({ value: 'HeroBlock', closed: true, complete: false })
    s.push(',')
    expect(completeString(entryOf(s.root, 'type'))).toBe('HeroBlock')
  })

  it('a number is complete only once the next delimiter arrives (12 could become 123)', () => {
    const s = new PartialJsonScanner()
    s.push('{"index":12')
    expect(completeInt(entryOf(s.root, 'index'))).toBeUndefined()
    s.push('3}')
    expect(completeInt(entryOf(s.root, 'index'))).toBe(123)
    expect(s.root?.complete).toBe(true)
  })

  it('decodes escapes monotonically: a partial \\uXXXX adds nothing until its four hex digits arrive', () => {
    const s = new PartialJsonScanner()
    s.push('{"t":"Caf\\u00')
    expect(entryOf(s.root, 't')).toMatchObject({ value: 'Caf' })
    s.push('e9 \\"x\\" \\n')
    expect(entryOf(s.root, 't')).toMatchObject({ value: 'Café "x" \n' })
  })

  it('builds nested objects and arrays and stops on invalid JSON', () => {
    const s = new PartialJsonScanner()
    s.push('{"props":{"items":[{"q":"a"},{"q":"b')
    const items = entryOf(entryOf(s.root, 'props'), 'items')
    expect(items?.kind).toBe('array')
    if (items?.kind !== 'array') return
    expect(items.items).toHaveLength(2)
    expect(items.items[0].complete).toBe(true)
    expect(entryOf(items.items[1], 'q')).toMatchObject({ value: 'b', complete: false })

    const bad = new PartialJsonScanner()
    bad.push('{"a" 1}')
    expect(bad.failed).toBe(true)
  })
})

// ── add_block streaming ──────────────────────────────────────────────────────────────

const page = (): PageData => ({
  root: { props: {} },
  content: [{ type: 'HeroBlock', props: { id: 'hero-1', title: 'Hi' } }],
  zones: {},
})

type AnyTool = {
  execute: (input: unknown, opts: { toolCallId: string; messages: unknown[] }) => unknown
  onInputStart?: (opts: { toolCallId: string; messages: unknown[] }) => void
  onInputDelta?: (opts: { toolCallId: string; inputTextDelta: string; messages: unknown[] }) => void
}

function setup(opts: { coalesceMs?: number; now?: () => number } = {}) {
  const ops: PageOp[] = []
  const shadow = new ShadowPage(page(), pageCatalog)
  const sink = new OpSink(shadow, (op) => ops.push(JSON.parse(JSON.stringify(op))))
  let n = 0
  const { tools } = createEditTools({
    shadow,
    sink,
    refs: { course: ['7'], product: [], plan: [] },
    idFactory: (type) => `${type}-new${++n}`,
    coalesceMs: opts.coalesceMs ?? 0,
    now: opts.now,
  })
  const t = tools as unknown as Record<string, AnyTool>
  const call = (name: string, toolCallId: string, chunks: string[], input: unknown) => {
    t[name].onInputStart?.({ toolCallId, messages: [] })
    const after: PageOp[][] = []
    for (const c of chunks) {
      t[name].onInputDelta?.({ toolCallId, inputTextDelta: c, messages: [] })
      after.push(ops.slice())
    }
    const result = t[name].execute(input, { toolCallId, messages: [] }) as Record<string, unknown>
    return { result, after }
  }
  return { ops, shadow, call, tools: t }
}

describe('add_block streaming', () => {
  it('places a provisional block once type is complete and props start, streams text as appends, then finalises with one update', () => {
    const { ops, shadow, call } = setup()
    const chunks = ['{"type":"Hero', 'Block","pro', 'ps":{"title":"Learn', ' to code', '","subtitle":"Fast', ' and fun"}}']
    const input = { type: 'HeroBlock', props: { title: 'Learn to code', subtitle: 'Fast and fun' } }
    const { result, after } = call('add_block', 'call-1', chunks, input)

    // Nothing until `type` is complete AND props has started.
    expect(after[0]).toEqual([])
    expect(after[1]).toEqual([])
    expect(after[2]).toEqual([
      { op: 'add', id: 'HeroBlock-new1', type: 'HeroBlock', zone: ROOT_ZONE, index: 1, props: { title: 'Learn' } },
    ])
    // Growth of a field already sent → an append tail, never the whole text again.
    expect(after[3].slice(1)).toEqual([{ op: 'update', id: 'HeroBlock-new1', appends: { title: ' to code' } }])
    // A field seen for the first time after the add is SET (it replaces the default text).
    expect(after[4].slice(2)).toEqual([{ op: 'update', id: 'HeroBlock-new1', props: { subtitle: 'Fast' } }])

    expect(result).toEqual({ ok: true, id: 'HeroBlock-new1' })
    const final = ops[ops.length - 1]
    expect(final).toEqual({ op: 'update', id: 'HeroBlock-new1', props: { title: 'Learn to code', subtitle: 'Fast and fun' } })
    // Provisional add precedes the final update.
    expect(ops.findIndex((o) => o.op === 'add')).toBeLessThan(ops.indexOf(final))
    // The shadow saw every op: get_page reflects the turn.
    const block = shadow.data.content[1]
    expect(block.props).toMatchObject({ id: 'HeroBlock-new1', title: 'Learn to code', subtitle: 'Fast and fun' })
  })

  it('URLs and enums never stream; they arrive with the final validated update', () => {
    const { ops, call } = setup()
    const chunks = ['{"type":"HeroBlock","props":{"primaryCtaHref":"/cour', 'ses","title":"T"', '}}']
    call('add_block', 'c', chunks, { type: 'HeroBlock', props: { primaryCtaHref: '/courses', title: 'T' } })
    const streamed = ops.slice(0, -1)
    expect(JSON.stringify(streamed)).not.toContain('/cour')
    expect(ops[ops.length - 1]).toMatchObject({ op: 'update', props: { primaryCtaHref: '/courses', title: 'T' } })
  })

  it('array items: a new index sends the list as skeletons, then appends on items[i].field', () => {
    const { ops, call } = setup()
    const chunks = [
      '{"type":"FaqAccordion","props":{"title":"FAQ","items":[{"question":"Why',
      '?","answer":"Bec',
      'ause"},{"question":"How',
      '"}]}}',
    ]
    const items = [
      { question: 'Why?', answer: 'Because' },
      { question: 'How', answer: '' },
    ]
    const { after } = call('add_block', 'c', chunks, { type: 'FaqAccordion', props: { title: 'FAQ', items } })
    const first = after[0]
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ op: 'add', type: 'FaqAccordion', props: { title: 'FAQ', items: [{ question: 'Why', answer: '' }] } })

    // `answer` was sent as '' in the skeleton, so its text appends too.
    expect(after[1].slice(1)).toEqual([
      { op: 'update', id: 'FaqAccordion-new1', appends: { 'items[0].question': '?', 'items[0].answer': 'Bec' } },
    ])
    // The second item arrives as a full-list skeleton carrying the first item's text.
    const grow = ops.find((o) => o.op === 'update' && Array.isArray((o.props as { items?: unknown[] } | undefined)?.items))
    expect(grow).toMatchObject({ props: { items: [{ question: 'Why?', answer: 'Because' }, { question: 'How', answer: '' }] } })
  })

  it('adds at the end when props start before the position, then moves once after_id parses', () => {
    const { ops, shadow, call } = setup()
    // A second block so "after hero-1" is not already the end.
    shadow.data.content.push({ type: 'TextBlock', props: { id: 'text-1', content: 'x' } })
    const chunks = ['{"type":"CtaBlock","props":{"title":"Go"},', '"after_id":"hero-1"', ',"zone":"root:defa', 'ult-zone"}']
    const { after, result } = call('add_block', 'c', chunks, { type: 'CtaBlock', props: { title: 'Go' }, after_id: 'hero-1' })
    expect(after[0][0]).toMatchObject({ op: 'add', zone: ROOT_ZONE, index: 2 })
    expect(after[2]).toContainEqual({ op: 'move', id: 'CtaBlock-new1', zone: ROOT_ZONE, index: 1 })
    expect(result).toEqual({ ok: true, id: 'CtaBlock-new1' })
    expect(shadow.data.content.map((i) => i.props.id)).toEqual(['hero-1', 'CtaBlock-new1', 'text-1'])
    // Already in place: execute does not move it again, it only finalises the props.
    expect(ops.filter((o) => o.op === 'move')).toHaveLength(1)
    expect(ops[ops.length - 1]).toMatchObject({ op: 'update', id: 'CtaBlock-new1' })
  })

  it('invalid input removes the provisional block and returns the errors to the model', () => {
    const { ops, shadow, call } = setup()
    const chunks = ['{"type":"HeroBlock","props":{"title":"Hello"', ',"bogus":"x"}}']
    const { result } = call('add_block', 'c', chunks, { type: 'HeroBlock', props: { title: 'Hello', bogus: 'x' } })
    expect(result.ok).toBe(false)
    expect(String((result.errors as string[])[0])).toMatch(/bogus/)
    expect(ops.map((o) => o.op)).toEqual(['add', 'remove'])
    expect(shadow.data.content.map((i) => i.props.id)).toEqual(['hero-1'])
  })

  it('a ref id outside this school is rejected (no cross-tenant binding)', () => {
    const { ops, call } = setup()
    const { result } = call('add_block', 'c', [], { type: 'CourseHero', props: { courseId: '999' } })
    expect(result.ok).toBe(false)
    expect(ops).toEqual([])
    const ok = call('add_block', 'd', [], { type: 'CourseHero', props: { courseId: 7 } })
    expect(ok.result.ok).toBe(true)
    expect(ops[0]).toMatchObject({ op: 'add', type: 'CourseHero', props: { courseId: '7' } })
  })

  it('without input deltas (non-streaming provider) execute emits a single add', () => {
    const { ops, call } = setup()
    const { result } = call('add_block', 'c', [], { type: 'TextBlock', index: 0, props: { content: 'Intro' } })
    expect(result).toEqual({ ok: true, id: 'TextBlock-new1' })
    expect(ops).toEqual([{ op: 'add', id: 'TextBlock-new1', type: 'TextBlock', zone: ROOT_ZONE, index: 0, props: { content: 'Intro' } }])
  })

  it('coalesces appends to one op per window per block', () => {
    let t = 0
    const ticks = [0, 10, 20, 60]
    const { ops, tools } = setup({ coalesceMs: 50, now: () => t })
    const add = tools.add_block
    add.onInputStart?.({ toolCallId: 'c', messages: [] })
    ;['{"type":"HeroBlock","props":{"title":"A', 'B', 'C', 'D'].forEach((chunk, i) => {
      t = ticks[i]
      add.onInputDelta?.({ toolCallId: 'c', inputTextDelta: chunk, messages: [] })
    })
    // B and C (within 50 ms of the add) are held; D at 60 ms flushes all three as one tail.
    expect(ops.filter((o) => o.op === 'update')).toEqual([{ op: 'update', id: 'HeroBlock-new1', appends: { title: 'BCD' } }])
  })

  it('interleaved calls are tracked per toolCallId', () => {
    const { ops, tools } = setup()
    const add = tools.add_block
    add.onInputStart?.({ toolCallId: 'a', messages: [] })
    add.onInputStart?.({ toolCallId: 'b', messages: [] })
    add.onInputDelta?.({ toolCallId: 'a', inputTextDelta: '{"type":"HeroBlock","props":{"title":"One', messages: [] })
    add.onInputDelta?.({ toolCallId: 'b', inputTextDelta: '{"type":"CtaBlock","props":{"title":"Two', messages: [] })
    add.onInputDelta?.({ toolCallId: 'a', inputTextDelta: '!', messages: [] })
    expect(ops.filter((o) => o.op === 'add').map((o) => (o as { type: string }).type)).toEqual(['HeroBlock', 'CtaBlock'])
    expect(ops[ops.length - 1]).toEqual({ op: 'update', id: 'HeroBlock-new1', appends: { title: '!' } })
  })
})
