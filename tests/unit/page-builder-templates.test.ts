import { describe, expect, it } from 'vitest'
import {
  PAGE_TEMPLATES,
  PRESETS,
  ROOT_ZONE,
  allItems,
  applyOps,
  cloneWithFreshIds,
  emptyPage,
  formatTemplateList,
  getTemplate,
  hasBindingTokens,
  instantiatePreset,
  instantiateTemplate,
  listTemplates,
  pageCatalog,
  presetToOps,
  substituteBindings,
  templateToOps,
  type PageData,
} from '@lms/core'
import { PUCK_TEMPLATES, deepCloneWithFreshIds } from '@/lib/puck/templates'

const idsOf = (data: PageData) => allItems(data).map((n) => n.item.props.id)

describe('generated templates', () => {
  it('match lib/puck/templates (run npm run gen:puck-fields if this fails)', () => {
    expect(PAGE_TEMPLATES.map((t) => t.id)).toEqual(PUCK_TEMPLATES.map((t) => t.id))
    for (const lib of PUCK_TEMPLATES) {
      const core = getTemplate(lib.id)!
      expect(core.name).toBe(lib.name)
      expect(core.pageType).toBe(lib.pageType)
      expect(core.blocks).toEqual(lib.puck_data.content.map((i) => i.type))
      expect(core.puck_data).toEqual(JSON.parse(JSON.stringify(lib.puck_data)))
    }
  })

  it('every template has a unique stable slug id', () => {
    const ids = PAGE_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(getTemplate('school-home')?.name).toBe('Modern Academy')
  })

  it('lists summaries without page data, sorted, filterable by page type', () => {
    const all = listTemplates()
    expect(all).toHaveLength(PAGE_TEMPLATES.length)
    expect(all[0]).not.toHaveProperty('puck_data')
    expect(listTemplates({ pageType: 'faq' }).every((t) => t.pageType === 'faq' || t.pageType === 'all')).toBe(true)
    expect(formatTemplateList().split('\n')).toHaveLength(PAGE_TEMPLATES.length)
  })
})

describe('instantiateTemplate', () => {
  it.each(PAGE_TEMPLATES.map((t) => [t.id]))('%s instantiates and validates', (id) => {
    const tpl = getTemplate(id)!
    const data = instantiateTemplate(id, { bindings: { schoolName: 'Escuela Sol', year: 2031 } })
    const r = pageCatalog.validatePage(data)
    expect(r.errors).toEqual([])
    const ids = idsOf(data)
    expect(new Set(ids).size).toBe(ids.length)
    const tplIds = new Set(idsOf(tpl.puck_data))
    for (const fresh of ids) expect(tplIds.has(fresh)).toBe(false)
    expect(hasBindingTokens(data)).toBe(false)
    const header = data.content.find((i) => i.type === 'Header')
    if (header) {
      expect(header.props.logoText).toBe('Escuela Sol')
      expect(header.props.logo).toBe('')
    }
    const footer = data.content.find((i) => i.type === 'Footer')
    if (footer) expect(footer.props.copyright).toBe('© 2031 Escuela Sol. All rights reserved.')
  })

  it('fills unbound tokens with neutral fallbacks (human picker path)', () => {
    const data = deepCloneWithFreshIds(PUCK_TEMPLATES.find((t) => t.id === 'school-home')!.puck_data) as unknown as PageData
    expect(hasBindingTokens(data)).toBe(false)
    const year = String(new Date().getFullYear())
    expect(data.content.find((i) => i.type === 'Footer')!.props.copyright).toBe(`© ${year} Academy. All rights reserved.`)
  })
})

describe('bindings', () => {
  const tpl: PageData = {
    root: { props: {} },
    content: [
      { type: 'EnrollCta', props: { id: 'e', courseId: '{{courseId}}', headline: 'Join {{schoolName}} in {{year}}' } },
      { type: 'CourseGrid', props: { id: 'g', courseIds: [{ id: '{{courseId}}' }, { id: '7' }] } },
      { type: 'TextBlock', props: { id: 't', content: 'Keep {{unknown}} as is' } },
    ],
  }

  it('substitutes lone tokens, inline tokens, and numbers as strings', () => {
    const out = substituteBindings(tpl, { courseId: 12, schoolName: 'Sol', year: 2030 })
    expect(out.content[0].props).toMatchObject({ courseId: '12', headline: 'Join Sol in 2030' })
    expect(out.content[1].props.courseIds).toEqual([{ id: '12' }, { id: '7' }])
    expect(out.content[2].props.content).toBe('Keep {{unknown}} as is')
    expect(tpl.content[0].props.courseId).toBe('{{courseId}}')
  })

  it('drops list entries whose lone token resolved empty', () => {
    const out = substituteBindings(tpl, {})
    expect(out.content[0].props.courseId).toBe('')
    expect(out.content[1].props.courseIds).toEqual([{ id: '7' }])
  })
})

describe('cloneWithFreshIds (critique D5)', () => {
  it('re-keys DropZone children onto the new parent ids', () => {
    let n = 0
    const src: PageData = {
      root: { props: {} },
      content: [{ type: 'Columns', props: { id: 'cols' } }],
      zones: {
        'cols:left': [{ type: 'Columns', props: { id: 'inner' } }],
        'inner:main': [{ type: 'TextBlock', props: { id: 'txt', content: 'deep' } }],
      },
    }
    const out = cloneWithFreshIds(src, { idFactory: (t) => `${t}-${++n}` })
    expect(out.content[0].props.id).toBe('Columns-1')
    expect(Object.keys(out.zones!).sort()).toEqual(['Columns-1:left', 'Columns-2:main'])
    expect(out.zones!['Columns-2:main'][0].props).toEqual({ id: 'TextBlock-3', content: 'deep' })
    expect(pageCatalog.validatePage(out).warnings).toEqual([])
    expect(src.zones!['cols:left'][0].props.id).toBe('inner')
  })
})

describe('templateToOps', () => {
  it('reset + one add per block rebuilds the template on any page', () => {
    const ops = templateToOps('school-home', { bindings: { schoolName: 'Sol' } })
    expect(ops[0].op).toBe('reset')
    const existing: PageData = { root: { props: {} }, content: [{ type: 'HeroBlock', props: { id: 'old' } }] }
    const { data, warnings } = applyOps(existing, ops, pageCatalog)
    expect(warnings).toEqual([])
    expect(data.content.map((i) => i.type)).toEqual(getTemplate('school-home')!.blocks)
    expect(pageCatalog.validatePage(data).ok).toBe(true)
    expect(data.content[0].props.logoText).toBe('Sol')
  })
})

describe('section presets (critique I)', () => {
  it.each(PRESETS.map((p) => [p.id]))('%s resolves, inserts and validates', (id) => {
    const preset = PRESETS.find((p) => p.id === id)!
    const { items } = instantiatePreset(id)
    expect(items.map((i) => i.type)).toEqual(preset.blocks)
    const base = instantiateTemplate('blank')
    const ops = presetToOps(id, { index: 1 })
    const { data, warnings } = applyOps(base, ops, pageCatalog)
    expect(warnings).toEqual([])
    expect(data.content.slice(1, 1 + preset.blocks.length).map((i) => i.type)).toEqual(preset.blocks)
    expect(pageCatalog.validatePage(data).errors).toEqual([])
    expect(hasBindingTokens(data)).toBe(false)
  })

  it('preset ids are unique and their blocks are AI-allowed', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
    for (const p of PRESETS) for (const t of p.blocks) expect(pageCatalog.isAllowed(t), `${p.id}:${t}`).toBe(true)
  })

  it('inserts into an empty page at the root zone by default', () => {
    const { data } = applyOps(emptyPage(), presetToOps('pricing-faq', { index: 0 }), pageCatalog)
    expect(data.content.map((i) => i.type)).toEqual(['PricingTable', 'FaqAccordion'])
    expect(presetToOps('pricing-faq', { index: 0 }).every((o) => o.zone === ROOT_ZONE)).toBe(true)
  })
})
