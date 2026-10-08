import { describe, expect, it } from 'vitest'
import { PAGE_BUILDER_MANIFEST, pageCatalog } from '@lms/core'
import { AI_ANNOTATIONS, SHARED_FIELDS_KEY } from '@/lib/puck/ai-annotations'

const PROMPT_DOC_BUDGET = 6500

describe('pageCatalog: vocabulary', () => {
  it('excludes structural/primitive blocks from the AI but still knows them', () => {
    for (const t of ['Section', 'Columns', 'Container', 'Grid', 'Card', 'Spacer', 'Divider']) {
      expect(pageCatalog.knows(t), t).toBe(true)
      expect(pageCatalog.isAllowed(t), t).toBe(false)
    }
    for (const t of ['HeroBlock', 'FeaturesGrid', 'CourseGrid', 'EnrollCta', 'Header', 'Footer']) {
      expect(pageCatalog.isAllowed(t), t).toBe(true)
    }
    expect(pageCatalog.knows('NotABlock')).toBe(false)
  })

  it('folds every ai-annotation into the generated manifest (run npm run gen:puck-fields if this fails)', () => {
    for (const [name, a] of Object.entries(AI_ANNOTATIONS)) {
      if (name === SHARED_FIELDS_KEY) continue
      const entry = PAGE_BUILDER_MANIFEST.components[name]
      expect(entry, `annotation for unregistered block ${name}`).toBeDefined()
      if (!entry) continue
      expect(entry.ai?.instructions ?? '', name).toBe(a.instructions)
      expect(!!entry.ai?.exclude, name).toBe(!!a.exclude)
    }
    expect(Object.keys(PAGE_BUILDER_MANIFEST.shared.fields ?? {}).sort()).toEqual(
      Object.keys(AI_ANNOTATIONS[SHARED_FIELDS_KEY]?.fields ?? {}).sort()
    )
  })

  it('marks id fields as refs', () => {
    expect(pageCatalog.refFields('CourseGrid')).toEqual([{ key: 'courseIds', ref: 'courseList' }])
    expect(pageCatalog.refFields('EnrollCta')).toContainEqual({ key: 'courseId', ref: 'course' })
  })
})

describe('pageCatalog.validateBlock (strict, AI input)', () => {
  it('accepts a valid block and normalises it', () => {
    const r = pageCatalog.validateBlock('HeroBlock', {
      id: 'model-chosen',
      title: 'Learn Spanish',
      subtitle: null,
      primaryCtaHref: '/courses',
      secondaryCtaHref: '#faq',
      overlayOpacity: '40',
      alignment: 'center',
    })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.props).toEqual({ title: 'Learn Spanish', primaryCtaHref: '/courses', secondaryCtaHref: '#faq', overlayOpacity: 40, alignment: 'center' })
  })

  it('coerces boolean and numeric option strings', () => {
    const r = pageCatalog.validateBlock('CourseGrid', { showPrice: 'false', columns: 3, maxItems: '6' })
    expect(r.errors).toEqual([])
    expect(r.props).toEqual({ showPrice: false, columns: '3', maxItems: 6 })
  })

  it('rejects unknown and excluded types', () => {
    expect(pageCatalog.validateBlock('Nope', {}).errors[0]).toMatch(/unknown block type/)
    expect(pageCatalog.validateBlock('Columns', {}).errors[0]).toMatch(/layout block/)
    // An excluded block already on the page may still be edited.
    expect(pageCatalog.validateBlock('Columns', {}, { mode: 'update' }).ok).toBe(true)
  })

  it('rejects unknown props, bad enums and wrong types', () => {
    const r = pageCatalog.validateBlock('HeroBlock', { title: 'x', made_up: 1, alignment: 'diagonal', overlayOpacity: 'lots' })
    expect(r.ok).toBe(false)
    const text = r.errors.join('\n')
    expect(text).toMatch(/unknown prop\(s\) made_up/)
    expect(text).toMatch(/alignment/)
    expect(text).toMatch(/overlayOpacity/)
    expect(pageCatalog.validateBlock('FaqAccordion', { items: [{ question: 'q', bogus: 'x' }] }).errors.join()).toMatch(/bogus/)
    expect(pageCatalog.validateBlock('HeroBlock', 'nope').ok).toBe(false)
  })

  it('rejects unsafe URL schemes and non-hex colours, at any depth', () => {
    const r = pageCatalog.validateBlock('HeroBlock', {
      primaryCtaHref: 'javascript:alert(1)',
      secondaryCtaHref: '//evil.example',
      backgroundImage: 'http://insecure.example/a.png',
      backgroundColor: 'red;background:url(x)',
    })
    expect(r.errors.filter((e) => /unsafe/.test(e))).toHaveLength(3)
    expect(r.errors.join()).toMatch(/backgroundColor: colour/)
    const nested = pageCatalog.validateBlock('Header', { navLinks: [{ label: 'x', href: 'data:text/html,hi' }] })
    expect(nested.errors.join()).toMatch(/navLinks\[0\]\.href/)
    expect(pageCatalog.validateBlock('HeroBlock', { accentColor: '#AbC' }).errors.join()).toMatch(/unknown prop/)
    expect(pageCatalog.validateBlock('FeaturesGrid', { accentColor: '#AbCdEf' }).ok).toBe(true)
  })

  it('validates ref ids against the tenant set, accepting both id shapes', () => {
    const refs = { course: ['12', 34] }
    const ok = pageCatalog.validateBlock('CourseGrid', { courseIds: [{ id: 12 }, '34'] }, { refs })
    expect(ok.errors).toEqual([])
    expect(ok.props.courseIds).toEqual([{ id: '12' }, { id: '34' }])
    const single = pageCatalog.validateBlock('EnrollCta', { courseId: 12 }, { refs })
    expect(single.ok).toBe(true)
    expect(single.props.courseId).toBe('12')
    const bad = pageCatalog.validateBlock('CourseGrid', { courseIds: [{ id: '99' }] }, { refs })
    expect(bad.errors.join()).toMatch(/99 is not one of this school's course ids/)
    // No id set provided → refs are not checked.
    expect(pageCatalog.validateBlock('EnrollCta', { courseId: '99' }).ok).toBe(true)
  })

  it('enforces ai.required fields only when adding', () => {
    expect(pageCatalog.validateBlock('HeroBlock', { subtitle: 'x' }).errors).toContain('title: required')
    expect(pageCatalog.validateBlock('HeroBlock', { subtitle: 'x' }, { mode: 'update' }).ok).toBe(true)
  })

  it('caps one block at 32 KB of props', () => {
    const r = pageCatalog.validateBlock('HeroBlock', { title: 'x', subtitle: 'y'.repeat(40_000) })
    expect(r.errors.join()).toMatch(/bytes/)
  })
})

describe('pageCatalog helpers', () => {
  it('streams text fields only (no urls, ids, colours or shared fields)', () => {
    const fields = pageCatalog.streamableFields('HeroBlock')
    expect(fields).toEqual(expect.arrayContaining(['title', 'subtitle', 'primaryCtaLabel']))
    for (const f of ['primaryCtaHref', 'backgroundImage', 'backgroundColor', 'paddingY']) expect(fields).not.toContain(f)
    expect(pageCatalog.streamableFields('EnrollCta')).not.toContain('courseId')
  })

  it('emits a JSON schema subset per block', () => {
    const schema = pageCatalog.jsonSchema('FaqAccordion')!
    expect(schema.type).toBe('object')
    expect(Object.keys(schema.properties as object)).toContain('items')
  })
})

describe('pageCatalog.promptDoc', () => {
  const doc = pageCatalog.promptDoc()

  it(`fits the ${PROMPT_DOC_BUDGET}-character budget`, () => {
    expect(doc.length).toBeLessThanOrEqual(PROMPT_DOC_BUDGET)
  })

  it('lists every allowed block and no excluded one', () => {
    for (const t of pageCatalog.allowedTypes) expect(doc).toMatch(new RegExp(`^${t}: `, 'm'))
    for (const t of ['Section', 'Columns', 'Container']) expect(doc).not.toMatch(new RegExp(`^${t}: `, 'm'))
  })

  it('includes enums, informative labels, refs and instructions', () => {
    expect(doc).toContain('alignment left|center|right')
    expect(doc).toContain('"Curated Courses (leave empty for latest)"')
    expect(doc).toContain('courseIds course ids')
    expect(doc).toContain(pageCatalog.entry('HeroBlock')!.ai!.instructions)
    expect(doc).toContain('items[]{question,answer}')
    // Array sub-field annotations (`items.text`) reach the doc.
    expect(doc).toContain(`items[]{text (${AI_ANNOTATIONS.CourseOutcomes.fields!['items.text'].instructions})}`)
  })

  it('describes the shared section fields once (critique E5)', () => {
    const [, sharedLine, ...blockLines] = doc.split('\n')
    for (const key of pageCatalog.sharedFieldKeys) {
      expect(sharedLine, key).toMatch(new RegExp(`[ ;]${key} `))
      for (const line of blockLines) {
        const type = line.slice(0, line.indexOf(':'))
        if (!pageCatalog.isSharedField(type, key)) continue
        expect(line, key).not.toMatch(new RegExp(`[ ,]${key}( |,|$)`))
      }
    }
    expect(doc).toContain('+s')
    // The shared line uses the section layer's values, not a same-named field of one block.
    expect(sharedLine).toContain('maxWidth full|sm|md|lg|xl|none')
    expect(sharedLine).toContain('align default|start|center')
  })

  it('lets a block describe its own same-named field (TextBlock maxWidth, ShinyEyebrow align)', () => {
    expect(pageCatalog.isSharedField('TextBlock', 'maxWidth')).toBe(false)
    expect(pageCatalog.isSharedField('FaqAccordion', 'maxWidth')).toBe(true)
    const line = (t: string) => doc.split('\n').find((l) => l.startsWith(`${t}: `)) ?? ''
    if (pageCatalog.isAllowed('ShinyEyebrow')) {
      expect(pageCatalog.isSharedField('ShinyEyebrow', 'align')).toBe(false)
      expect(line('ShinyEyebrow')).toMatch(/align left\|center\|right/)
    }
    expect(line('TextBlock')).toMatch(/maxWidth none\|480px/)
    expect(line('TextBlock')).not.toContain('+s')
  })

  it('rejects an anchorId that is not a lowercase slug', () => {
    expect(pageCatalog.validateBlock('FaqAccordion', { anchorId: 'about-us' }, { mode: 'update' }).ok).toBe(true)
    const bad = pageCatalog.validateBlock('FaqAccordion', { anchorId: 'About Us!' }, { mode: 'update' })
    expect(bad.ok).toBe(false)
    expect(bad.errors.join()).toMatch(/anchorId/)
  })
})

describe('pageCatalog: root (page SEO) settings', () => {
  it('knows the root fields from config.root', () => {
    expect(Object.keys(pageCatalog.rootFields()).sort()).toEqual(['metaDescription', 'metaTitle', 'ogImage'])
  })

  it('validateRoot accepts known string settings and rejects the rest', () => {
    const ok = pageCatalog.validateRoot({ metaTitle: 'Learn guitar', ogImage: 'https://cdn.example/x.png' })
    expect(ok).toEqual({ ok: true, props: { metaTitle: 'Learn guitar', ogImage: 'https://cdn.example/x.png' }, errors: [] })
    const bad = pageCatalog.validateRoot({ title: 'x', metaDescription: 5, ogImage: 'javascript:alert(1)' })
    expect(bad.ok).toBe(false)
    expect(bad.errors.join('\n')).toMatch(/title: not a page setting/)
    expect(bad.errors.join('\n')).toMatch(/metaDescription: must be a string/)
    expect(bad.errors.join('\n')).toMatch(/ogImage: unsafe image URL/)
    expect(pageCatalog.validateRoot('nope').ok).toBe(false)
  })
})
