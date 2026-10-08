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
import { PUCK_TEMPLATES, deepCloneWithFreshIds, templateBindingNeeds } from '@/lib/puck/templates'
import { productBindings, schoolBindingsFromSettings, slugFromTitle } from '@/lib/puck/templates/school-bindings'

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
    if (footer) expect(footer.props.copyright).toMatch(/^© 2031 Escuela Sol\b/)
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

// ── WP5: course and product templates ───────────────────────────────────────────────────

const COURSE_BLOCKS = new Set(['CourseHero', 'CourseOutcomes', 'CourseCurriculum', 'InstructorCard', 'CoursePricingCard', 'EnrollCta', 'TestimonialGrid'])

describe('course and product templates (WP5)', () => {
  it.each([
    ['course-landing', 'course', ['Header', 'CourseHero', 'SocialProof', 'CourseOutcomes', 'CourseCurriculum', 'InstructorCard', 'TestimonialGrid', 'CoursePricingCard', 'FaqAccordion', 'EnrollCta', 'Footer']],
    ['course-launch-short', 'course', ['Header', 'CourseHero', 'CourseOutcomes', 'CoursePricingCard', 'FaqSplit', 'Footer']],
    ['free-course-lead', 'course', ['Header', 'CourseHero', 'CourseCurriculum', 'EnrollCta', 'Footer']],
    ['product-bundle', 'product', ['Header', 'HeroBlock', 'CoursePricingCard', 'CourseGrid', 'TestimonialGrid', 'FaqAccordion', 'CtaBanner', 'Footer']],
    ['pricing-page', 'pricing', ['Header', 'HeroBlock', 'PricingTable', 'ProductGrid', 'FaqAccordion', 'CtaBlock', 'Footer']],
  ])('%s is a %s template with the designed block sequence', (id, pageType, blocks) => {
    const tpl = getTemplate(id)!
    expect(tpl.pageType).toBe(pageType)
    expect(tpl.blocks).toEqual(blocks)
    expect(listTemplates({ pageType }).map((t) => t.id)).toContain(id)
  })

  it('course templates bind every course block to {{courseId}} and ask for a course', () => {
    for (const id of ['course-landing', 'course-launch-short', 'free-course-lead']) {
      const tpl = PUCK_TEMPLATES.find((t) => t.id === id)!
      expect(templateBindingNeeds(tpl.puck_data)).toEqual({ course: true, product: false })
      const data = instantiateTemplate(id, { bindings: { courseId: 12, schoolName: 'Sol' } })
      expect(hasBindingTokens(data)).toBe(false)
      const bound = data.content.filter((i) => COURSE_BLOCKS.has(i.type))
      expect(bound.length).toBeGreaterThan(1)
      for (const item of bound) expect(item.props.courseId, `${id}:${item.type}`).toBe('12')
    }
  })

  it('course refs validate against the tenant set and reject a foreign course', () => {
    const data = instantiateTemplate('course-landing', { bindings: { courseId: 12 } })
    expect(pageCatalog.validatePage(data, { refs: { course: ['12'] } }).errors).toEqual([])
    const foreign = pageCatalog.validatePage(data, { refs: { course: ['7'] } })
    expect(foreign.ok).toBe(false)
    expect(foreign.errors.join('\n')).toMatch(/12/)
  })

  it('an unbound course template still validates (editor notices fill the gaps)', () => {
    const data = instantiateTemplate('course-landing')
    expect(hasBindingTokens(data)).toBe(false)
    expect(data.content.find((i) => i.type === 'CourseHero')!.props.courseId).toBe('')
    expect(pageCatalog.validatePage(data, { refs: { course: [] } }).errors).toEqual([])
  })

  it('product-bundle binds the product and lists exactly its courses', () => {
    const tpl = PUCK_TEMPLATES.find((t) => t.id === 'product-bundle')!
    expect(templateBindingNeeds(tpl.puck_data)).toEqual({ course: false, product: true })
    const data = instantiateTemplate('product-bundle', { bindings: productBindings({ id: '5', courseIds: ['3', '4'] }) })
    expect(hasBindingTokens(data)).toBe(false)
    expect(data.content.find((i) => i.type === 'CoursePricingCard')!.props).toMatchObject({ productId: '5', courseId: '' })
    expect(data.content.find((i) => i.type === 'CourseGrid')!.props.courseIds).toEqual([{ id: '3' }, { id: '4' }])
    expect(pageCatalog.validatePage(data, { refs: { product: ['5'], course: ['3', '4'] } }).errors).toEqual([])
    expect(pageCatalog.validatePage(data, { refs: { product: ['6'] } }).ok).toBe(false)

    const unbound = instantiateTemplate('product-bundle')
    expect(unbound.content.find((i) => i.type === 'CourseGrid')!.props.courseIds).toEqual([])
    expect(unbound.content.find((i) => i.type === 'CoursePricingCard')!.props.productId).toBe('')
  })

  it.each(['course-landing', 'course-launch-short', 'free-course-lead', 'product-bundle', 'pricing-page'])(
    '%s: every Header #anchor link scrolls to a section on the page',
    (id) => {
      const data = instantiateTemplate(id, { bindings: { courseId: 1, productId: 2 } })
      const anchors = new Set(data.content.map((i) => i.props.anchorId).filter(Boolean))
      const header = data.content.find((i) => i.type === 'Header')!
      const links = [
        ...(header.props.navLinks as { href: string }[]).map((l) => l.href),
        header.props.ctaHref as string,
      ].filter((h) => h.startsWith('#'))
      expect(links.length).toBeGreaterThan(0)
      for (const href of links) expect(anchors.has(href.slice(1)), `${id}: ${href}`).toBe(true)
      // Anchors are unique and valid slugs.
      const all = data.content.map((i) => i.props.anchorId).filter(Boolean) as string[]
      expect(new Set(all).size).toBe(all.length)
      for (const a of all) expect(a).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    }
  )

  it.each(['course-landing', 'course-launch-short', 'free-course-lead', 'product-bundle', 'pricing-page'])(
    '%s: AI-allowed blocks pass the strict validator, and the template rebuilds through ops',
    (id) => {
      const data = instantiateTemplate(id, { bindings: { courseId: 1, productId: 2, courseIds: [1] } })
      for (const item of data.content) {
        if (!pageCatalog.isAllowed(item.type)) continue
        const props: Record<string, unknown> = { ...item.props }
        delete props.id
        const r = pageCatalog.validateBlock(item.type, props)
        expect(r.errors, `${id}:${item.type}`).toEqual([])
      }
      const ops = templateToOps(id, { bindings: { courseId: 1 } })
      const { data: rebuilt, warnings } = applyOps(emptyPage(), ops, pageCatalog)
      expect(warnings).toEqual([])
      expect(rebuilt.content.map((i) => i.type)).toEqual(getTemplate(id)!.blocks)
    }
  )

  it('alternates section tones for rhythm (no two adjacent sections share a tint)', () => {
    for (const id of ['course-landing', 'course-launch-short', 'free-course-lead', 'product-bundle', 'pricing-page']) {
      const tones = getTemplate(id)!.puck_data.content
        .filter((i) => 'tone' in i.props)
        .map((i) => i.props.tone as string)
      expect(tones.some((t) => t !== 'default'), id).toBe(true)
      for (let i = 1; i < tones.length; i++) {
        if (tones[i] !== 'default') expect(tones[i - 1], `${id}@${i}`).not.toBe(tones[i])
      }
    }
  })

  it('never ships invented prices: pricing-page manual plans are empty', () => {
    const table = getTemplate('pricing-page')!.puck_data.content.find((i) => i.type === 'PricingTable')!
    expect(table.props.items).toEqual([])
    expect(table.props.planIds).toEqual([])
  })
})

describe('TeamGrid placeholders (live-or-notice)', () => {
  it('no template ships invented team members', () => {
    for (const tpl of PAGE_TEMPLATES) {
      for (const { item } of allItems(tpl.puck_data)) {
        if (item.type !== 'TeamGrid') continue
        expect(item.props.source, tpl.id).toBe('live')
        expect(item.props.members, tpl.id).toEqual([])
      }
    }
  })

  it('the block default is a placeholder, not a person', () => {
    const defaults = pageCatalog.defaultProps('TeamGrid') as { source: string; members: { name: string; bio: string }[] }
    expect(defaults.source).toBe('live')
    expect(defaults.members.length).toBeGreaterThan(0)
    for (const m of defaults.members) {
      expect(m.name).toBe('Team member name')
      expect(m.bio).not.toMatch(/\d+\+?\s*years|Google|Stripe|certified/i)
    }
  })
})

describe('list bindings ({{courseIds}})', () => {
  it('expands a lone list token in either shape, dedupes, and drops it when unbound', () => {
    const value = { a: [{ id: '{{courseIds}}' }, { id: '9' }], b: ['{{courseIds}}'], c: 'ids: {{courseIds}}' }
    expect(substituteBindings(value, { courseIds: [3, '4', 3] })).toEqual({
      a: [{ id: '3' }, { id: '4' }, { id: '9' }],
      b: ['3', '4'],
      c: 'ids: 3,4',
    })
    expect(substituteBindings(value, {})).toEqual({ a: [{ id: '9' }], b: [], c: 'ids: ' })
    expect(hasBindingTokens(value)).toBe(true)
  })
})

describe('section presets with a course binding (WP5)', () => {
  it('course presets bind the given course', () => {
    const ops = presetToOps('course-hero-outcomes', { index: 0 }, { bindings: { courseId: 33 } })
    expect(ops.map((o) => o.type)).toEqual(['CourseHero', 'CourseOutcomes'])
    for (const o of ops) expect(o.props.courseId).toBe('33')
    const bundle = instantiatePreset('bundle-pricing-courses', { bindings: productBindings({ id: '8', courseIds: ['1', '2'] }) })
    expect(bundle.items.map((i) => i.type)).toEqual(['CoursePricingCard', 'CourseGrid'])
    expect(bundle.items[0].props.productId).toBe('8')
    expect(bundle.items[1].props.courseIds).toEqual([{ id: '1' }, { id: '2' }])
  })
})

describe('school bindings', () => {
  it('reads site_name / logo_url bare or as { value }, and drops unsafe logos', () => {
    expect(schoolBindingsFromSettings({ site_name: { value: ' Escuela Sol ' }, logo_url: 'https://cdn.example/logo.png' })).toEqual({
      schoolName: 'Escuela Sol',
      logoUrl: 'https://cdn.example/logo.png',
    })
    expect(schoolBindingsFromSettings({ site_name: '', logo_url: { value: 'javascript:alert(1)' } })).toEqual({})
    expect(schoolBindingsFromSettings({ logo_url: '//evil.example/x.png' })).toEqual({})
    expect(schoolBindingsFromSettings({ logo_url: '/uploads/logo.png' })).toEqual({ logoUrl: '/uploads/logo.png' })
    expect(schoolBindingsFromSettings(undefined)).toEqual({})
  })

  it('a school name flows into the header and footer of a bound template', () => {
    const data = deepCloneWithFreshIds(
      PUCK_TEMPLATES.find((t) => t.id === 'course-landing')!.puck_data,
      { ...schoolBindingsFromSettings({ site_name: 'Sol' }), courseId: '4' }
    ) as unknown as PageData
    expect(data.content[0].props.logoText).toBe('Sol')
    expect(data.content.at(-1)!.props.copyright).toMatch(/^© \d{4} Sol$/)
    expect(hasBindingTokens(data)).toBe(false)
  })

  it('slugs a course title for /p/<slug>', () => {
    expect(slugFromTitle('Introducción a Python: ¡desde cero!')).toBe('introduccion-a-python-desde-cero')
    expect(slugFromTitle('  ***  ')).toBe('')
    expect(slugFromTitle('a'.repeat(80) + ' b').length).toBeLessThanOrEqual(60)
  })
})
