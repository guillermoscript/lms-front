/**
 * Page Architect edit tools against a fake writer + the shadow page (design §7 WP1): each
 * tool validates, applies to the shadow synchronously and writes the same ops the editor
 * applies; get_page reads the shadow; destructive calls need approval; budgets hold.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/puck/utils/landing-data', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({}))

import { ROOT_ZONE, applyOps, pageCatalog, type PageData, type PageOp, type ThemePreview } from '@lms/core'
import { EDIT_TOOL_NAMES, OpSink, ShadowPage, createEditTools, resolvePlacement } from '@/lib/page-builder/edit-tools'
import { DATA_TOOL_NAMES } from '@/lib/page-builder/data-tools'
import en from '@/messages/en.json'
import es from '@/messages/es.json'

type AnyTool = { execute: (input: unknown, opts: { toolCallId: string; messages: unknown[] }) => unknown }

const base = (): PageData => ({
  root: { props: { metaTitle: 'Old' } },
  content: [
    { type: 'HeroBlock', props: { id: 'hero-1', title: 'Welcome' } },
    { type: 'TextBlock', props: { id: 'text-1', content: 'About us' } },
    { type: 'CtaBlock', props: { id: 'cta-1', title: 'Join' } },
  ],
  zones: {},
})

function setup(page: PageData | null = base(), opts: { maxOps?: number } = {}) {
  const ops: PageOp[] = []
  const previews: ThemePreview[] = []
  const shadow = new ShadowPage(page, pageCatalog)
  const sink = new OpSink(shadow, (op) => ops.push(JSON.parse(JSON.stringify(op))), { maxOps: opts.maxOps })
  let n = 0
  const edit = createEditTools({
    shadow,
    sink,
    refs: { course: ['7', '8'], product: ['3'], plan: ['1'] },
    bindings: { schoolName: 'Acme Academy' },
    productCourseIds: (id) => (id === '3' ? ['7', '8'] : undefined),
    selectedId: 'text-1',
    emitThemePreview: (p) => previews.push(p),
    idFactory: (type) => `${type}-n${++n}`,
    coalesceMs: 0,
  })
  const tools = edit.tools as unknown as Record<string, AnyTool>
  let call = 0
  const run = (name: string, input: unknown) =>
    tools[name].execute(input, { toolCallId: `t${++call}`, messages: [] }) as Record<string, unknown>
  return { ops, previews, shadow, sink, run, approval: edit.toolApproval, initial: page }
}

describe('edit tools', () => {
  it('the ops written to the editor replay to exactly the shadow page', () => {
    const { ops, shadow, run, initial } = setup()
    run('add_block', { type: 'TextBlock', after_id: 'hero-1', props: { content: 'New' } })
    run('update_block', { id: 'cta-1', props: { title: 'Enrol today' } })
    run('move_block', { id: 'cta-1', index: 0 })
    run('remove_block', { id: 'text-1' })
    run('duplicate_block', { id: 'hero-1' })
    run('set_page_meta', { metaTitle: 'New title' })
    const replay = applyOps(initial!, ops, pageCatalog)
    expect(replay.warnings).toEqual([])
    expect(replay.data).toEqual(shadow.data)
  })

  it('get_page reflects earlier ops of the same turn and marks the selected block', () => {
    const { run } = setup()
    run('add_block', { type: 'TextBlock', index: 0, props: { content: 'First words' } })
    const page = run('get_page', {})
    expect(page.ok).toBe(true)
    expect(String(page.outline).split('\n')[0]).toContain('TextBlock [TextBlock-n1] "First words"')
    expect(String(page.outline)).toContain('[text-1] "About us"  <- selected')
    const one = run('get_page', { id: 'cta-1' })
    expect(one).toMatchObject({ ok: true, type: 'CtaBlock', props: { id: 'cta-1', title: 'Join' } })
  })

  it('update_block merges validated props and rejects unknown props without writing an op', () => {
    const { ops, shadow, run } = setup()
    expect(run('update_block', { id: 'hero-1', props: { subtitle: 'Learn fast' } })).toEqual({ ok: true, id: 'hero-1' })
    expect(shadow.data.content[0].props).toMatchObject({ title: 'Welcome', subtitle: 'Learn fast' })
    const bad = run('update_block', { id: 'hero-1', props: { nope: 1 } })
    expect(bad.ok).toBe(false)
    const unsafe = run('update_block', { id: 'hero-1', props: { primaryCtaHref: 'javascript:alert(1)' } })
    expect(unsafe.ok).toBe(false)
    expect(run('update_block', { id: 'ghost', props: { title: 'x' } }).ok).toBe(false)
    expect(ops).toHaveLength(1)
  })

  it('apply_template resets the page and adds the template blocks with fresh ids and bindings', () => {
    const { ops, shadow, run } = setup(null)
    const res = run('apply_template', { templateId: 'course-landing', bindings: { courseId: '7' } })
    expect(res.ok).toBe(true)
    expect(ops[0]).toMatchObject({ op: 'reset' })
    expect(ops.slice(1).every((o) => o.op === 'add')).toBe(true)
    const ids = shadow.data.content.map((i) => i.props.id)
    expect(new Set(ids).size).toBe(ids.length)
    // The course binding reached the course blocks; no raw binding token survived.
    expect(JSON.stringify(shadow.data)).not.toMatch(/\{\{\s*\w+\s*\}\}/)
    expect(shadow.data.content.some((i) => i.props.courseId === '7')).toBe(true)
    expect(JSON.stringify(shadow.data)).toContain('Acme Academy')
    // The editor prompts the template ships come back as a to-do list for the model.
    const rewrite = (res as { rewrite?: Array<{ id: string; type: string }> }).rewrite ?? []
    expect(rewrite.map((b) => b.type)).toEqual(expect.arrayContaining(['CourseOutcomes', 'FaqAccordion', 'CoursePricingCard']))
    expect(rewrite.every((b) => ids.includes(b.id))).toBe(true)
  })

  it('apply_template refuses another school\'s course and unknown templates', () => {
    const { ops, run } = setup(null)
    expect(run('apply_template', { templateId: 'course-landing', bindings: { courseId: '999' } }).ok).toBe(false)
    expect(run('apply_template', { templateId: 'nope' }).ok).toBe(false)
    expect(ops).toEqual([])
  })

  it('needs approval for apply_template on a non-empty page and for a turn removing 3+ blocks', () => {
    const empty = setup(null)
    expect(empty.approval.apply_template()).toBeUndefined()
    const full = setup()
    expect(full.approval.apply_template()).toMatchObject({ type: 'user-approval' })
    expect(full.approval.apply_template({ templateId: 'course-landing', bindings: { courseId: '7' } })).toMatchObject({
      type: 'user-approval',
    })
    // A call that cannot apply (live QA: the model passed a preset id) fails fast instead of asking.
    expect(full.approval.apply_template({ templateId: 'course-hero-outcomes' })).toBeUndefined()
    expect(full.approval.apply_template({ templateId: 'course-landing', bindings: { courseId: '999' } })).toBeUndefined()

    expect(full.approval.remove_block({ id: 'hero-1' })).toBeUndefined()
    full.run('remove_block', { id: 'hero-1' })
    expect(full.approval.remove_block({ id: 'text-1' })).toBeUndefined()
    full.run('remove_block', { id: 'text-1' })
    expect(full.approval.remove_block({ id: 'cta-1' })).toMatchObject({ type: 'user-approval' })
  })

  it('a removal that cascades into nested blocks counts every block', () => {
    const page = base()
    page.zones = {
      'hero-1:col': [
        { type: 'TextBlock', props: { id: 'n1', content: 'a' } },
        { type: 'TextBlock', props: { id: 'n2', content: 'b' } },
      ],
    }
    const { approval, run, shadow } = setup(page)
    expect(approval.remove_block({ id: 'hero-1' })).toMatchObject({ type: 'user-approval' })
    expect(run('remove_block', { id: 'hero-1' })).toEqual({ ok: true, removed: 3 })
    expect(shadow.data.zones).toEqual({})
  })

  it('stops committing once the per-turn op budget is spent', () => {
    const { ops, run } = setup(base(), { maxOps: 2 })
    expect(run('update_block', { id: 'hero-1', props: { title: 'a' } }).ok).toBe(true)
    expect(run('update_block', { id: 'hero-1', props: { title: 'b' } }).ok).toBe(true)
    const third = run('update_block', { id: 'hero-1', props: { title: 'c' } })
    expect(third.ok).toBe(false)
    expect(String((third.errors as string[])[0])).toMatch(/budget/)
    expect(ops).toHaveLength(2)
    // A multi-op tool is refused up front, not half-applied.
    expect(run('apply_template', { templateId: 'school-home' }).ok).toBe(false)
    expect(ops).toHaveLength(2)
  })

  it('duplicate_block copies a block (and its nested blocks) right after itself with fresh ids', () => {
    const page = base()
    page.content[0] = { type: 'Section', props: { id: 'hero-1' } }
    page.zones = { 'hero-1:content': [{ type: 'TextBlock', props: { id: 'n1', content: 'nested' } }] }
    const { ops, shadow, run } = setup(page)
    const res = run('duplicate_block', { id: 'hero-1' })
    expect(res).toEqual({ ok: true, id: 'Section-n1' })
    expect(ops.map((o) => o.op)).toEqual(['add', 'add'])
    expect(shadow.data.content[1].props.id).toBe('Section-n1')
    expect(shadow.data.zones?.['Section-n1:content']?.[0].props).toMatchObject({ content: 'nested' })
  })

  it('set_page_meta writes updateRoot and refuses unknown keys or unsafe images', () => {
    const { ops, run } = setup()
    expect(run('set_page_meta', { metaTitle: 'Learn', metaDescription: 'Desc' }).ok).toBe(true)
    expect(ops).toEqual([{ op: 'updateRoot', props: { metaTitle: 'Learn', metaDescription: 'Desc' } }])
    expect(run('set_page_meta', { ogImage: 'javascript:alert(1)' }).ok).toBe(false)
    expect(run('set_page_meta', {}).ok).toBe(false)
  })

  it('insert_preset adds a multi-block section at a position', () => {
    const { ops, shadow, run } = setup()
    const res = run('insert_preset', { presetId: 'faq-cta', after_id: 'hero-1' })
    expect(res.ok).toBe(true)
    expect(ops.every((o) => o.op === 'add')).toBe(true)
    expect(shadow.data.content.map((i) => i.type).slice(0, 3)).toEqual(['HeroBlock', 'FaqAccordion', 'CtaBlock'])
    expect(run('insert_preset', { presetId: 'nope' }).ok).toBe(false)
  })

  it('preview_theme only emits a transient preview (no page op) and validates its input', () => {
    const { ops, previews, run } = setup()
    const res = run('preview_theme', { preset: 'andina', primary: '#112233' })
    expect(res).toMatchObject({ ok: true, theme: 'andina', brand: '#112233' })
    expect(previews).toEqual([{ preset: 'andina', primary: '#112233' }])
    expect(ops).toEqual([])
    expect(run('preview_theme', { preset: 'neon' }).ok).toBe(false)
    expect(run('preview_theme', { preset: 'luz', primary: 'red' }).ok).toBe(false)
    expect(previews).toHaveLength(1)
  })

  it('add_block refuses a 41st section and layout-only blocks', () => {
    const page: PageData = {
      root: { props: {} },
      content: Array.from({ length: 40 }, (_, i) => ({ type: 'TextBlock', props: { id: `t${i}`, content: 'x' } })),
      zones: {},
    }
    const { ops, run } = setup(page)
    expect(run('add_block', { type: 'TextBlock', props: {} }).ok).toBe(false)
    expect(ops).toEqual([])
  })
})

describe('resolvePlacement', () => {
  it('after_id wins; index is clamped; unknown ids and zones are errors', () => {
    const data = base()
    expect(resolvePlacement(data, { after_id: 'text-1' })).toEqual({ zone: ROOT_ZONE, index: 2 })
    expect(resolvePlacement(data, { index: 99 })).toEqual({ zone: ROOT_ZONE, index: 3 })
    expect(resolvePlacement(data, {})).toEqual({ zone: ROOT_ZONE, index: 3 })
    // Ignoring the block being moved: "after text-1" for hero-1 is index 1 of the rest.
    expect(resolvePlacement(data, { after_id: 'text-1' }, 'hero-1')).toEqual({ zone: ROOT_ZONE, index: 1 })
    expect(resolvePlacement(data, { after_id: 'ghost' })).toHaveProperty('error')
    expect(resolvePlacement(data, { zone: 'ghost:col' })).toHaveProperty('error')
    expect(resolvePlacement(data, { zone: 'hero-1:col' })).toEqual({ zone: 'hero-1:col', index: 0 })
  })

  it('with the catalog, a new zone must be one its parent block renders', () => {
    const data = base()
    data.content.push({ type: 'Section', props: { id: 'sec-1' } }, { type: 'Columns', props: { id: 'cols-1' } })
    expect(resolvePlacement(data, { zone: 'hero-1:main' }, undefined, pageCatalog)).toHaveProperty('error')
    expect(resolvePlacement(data, { zone: 'sec-1:main' }, undefined, pageCatalog)).toHaveProperty('error')
    expect(resolvePlacement(data, { zone: 'sec-1:content' }, undefined, pageCatalog)).toEqual({ zone: 'sec-1:content', index: 0 })
    expect(resolvePlacement(data, { zone: 'cols-1:col-2' }, undefined, pageCatalog)).toEqual({ zone: 'cols-1:col-2', index: 0 })
    expect(resolvePlacement(data, { zone: 'cols-1:col-x' }, undefined, pageCatalog)).toHaveProperty('error')
    const r = applyOps(data, [{ op: 'add', id: 'n', type: 'TextBlock', zone: 'hero-1:main', index: 0, props: {} }], pageCatalog)
    expect(r.warnings[0]).toMatch(/zone "hero-1:main" does not exist/)
  })
})

describe('tool labels', () => {
  it('every Page Architect tool has a progress label in en and es (pageArchitect.panel.tools)', () => {
    const shadow = new ShadowPage(null)
    const names = Object.keys(createEditTools({ shadow, sink: new OpSink(shadow, () => {}), refs: {} }).tools)
    expect(names.sort()).toEqual([...EDIT_TOOL_NAMES].sort())
    for (const messages of [en, es] as Array<{ pageArchitect?: { panel?: { tools?: Record<string, string> } } }>) {
      const labels = messages.pageArchitect?.panel?.tools ?? {}
      for (const name of [...EDIT_TOOL_NAMES, ...DATA_TOOL_NAMES]) expect(labels[name], name).toBeTruthy()
    }
  })

  it('the AI settings page names the reused landing_builder feature "Page builder"', () => {
    expect(en.aiSettings.features.landing_builder.name).toBe('Page builder')
    expect(es.aiSettings.features.landing_builder.name).toBe('Constructor de páginas')
  })
})

describe('streamed add_block edge cases', () => {
  const full = (): PageData => ({
    root: { props: {} },
    content: Array.from({ length: 40 }, (_, i) => ({ type: 'TextBlock', props: { id: `t${i}`, content: 'x' } })),
    zones: {},
  })

  function streaming(page: PageData) {
    const ops: PageOp[] = []
    const shadow = new ShadowPage(page, pageCatalog)
    const sink = new OpSink(shadow, (op) => ops.push(JSON.parse(JSON.stringify(op))))
    let n = 0
    const edit = createEditTools({ shadow, sink, refs: {}, idFactory: (t) => `${t}-n${++n}`, coalesceMs: 0 })
    const tools = edit.tools as unknown as Record<string, AnyTool>
    return { ops, shadow, edit, tools }
  }

  it('a streamed add on a page at the 40-section cap never places a provisional block, and execute refuses it', () => {
    const { ops, shadow, edit, tools } = streaming(full())
    edit.streams.start('s1')
    edit.streams.delta('s1', '{"type":"TextBlock","props":{"content":"Hel')
    expect(ops).toEqual([])
    const res = tools.add_block.execute({ type: 'TextBlock', props: { content: 'Hello' } }, { toolCallId: 's1', messages: [] }) as Record<string, unknown>
    expect(res.ok).toBe(false)
    expect(shadow.topLevelCount).toBe(40)
  })

  it('sweepOrphans removes the provisional block of a call whose execute never ran', () => {
    const { ops, shadow, edit } = streaming({ root: { props: {} }, content: [], zones: {} })
    edit.streams.start('s1')
    edit.streams.delta('s1', '{"type":"TextBlock","props":{"content":"Hel')
    expect(shadow.topLevelCount).toBe(1)
    expect(edit.sweepOrphans()).toEqual(['TextBlock-n1'])
    expect(shadow.topLevelCount).toBe(0)
    expect(ops.at(-1)).toEqual({ op: 'remove', id: 'TextBlock-n1' })
  })

  it('apply_template needs approval when an add in the same step has not executed yet', () => {
    const { edit } = streaming({ root: { props: {} }, content: [], zones: {} })
    expect(edit.toolApproval.add_block()).toBeUndefined()
    expect(edit.toolApproval.apply_template()).toMatchObject({ type: 'user-approval' })
  })
})
