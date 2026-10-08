import { describe, expect, it } from 'vitest'
import { PAGE_LIMITS, isSafeColor, isSafeHref, isSafeImageUrl, pageCatalog, urlKindForKey, type PageData } from '@lms/core'

function page(extra: Partial<PageData> = {}): PageData {
  return {
    root: { props: { metaTitle: 'x' } },
    content: [
      { type: 'HeroBlock', props: { id: 'h1', title: 'Hi', legacyProp: 'kept', primaryCtaHref: '/courses' } },
      { type: 'Columns', props: { id: 'c1' } },
      { type: 'CourseGrid', props: { id: 'g1', courseIds: [{ id: '12' }] } },
      { type: 'EnrollCta', props: { id: 'e1', courseId: 34 } },
    ],
    zones: { 'c1:column-0': [{ type: 'TextBlock', props: { id: 't1', content: 'Nested' } }] },
    ...extra,
  }
}

describe('url rules', () => {
  it('classifies url keys', () => {
    expect(urlKindForKey('href')).toBe('href')
    expect(urlKindForKey('primaryCtaHref')).toBe('href')
    expect(urlKindForKey('url')).toBe('href')
    expect(urlKindForKey('src')).toBe('image')
    expect(urlKindForKey('backgroundImage')).toBe('image')
    expect(urlKindForKey('imageUrl')).toBe('image')
    expect(urlKindForKey('logo')).toBe('image')
    expect(urlKindForKey('imageAlt')).toBeNull()
    expect(urlKindForKey('title')).toBeNull()
  })

  it('allows only relative, anchor, https, mailto and tel links', () => {
    for (const ok of ['', '/', '/courses?x=1', '#faq', 'https://a.b/c', 'mailto:a@b.c', 'tel:+123', 'HTTPS://A.B']) {
      expect(isSafeHref(ok), ok).toBe(true)
    }
    for (const bad of [
      'javascript:alert(1)',
      ' java\nscript:alert(1)',
      'JaVaScRiPt:x',
      'data:text/html,x',
      'vbscript:x',
      '//evil.example',
      '/\\evil.example',
      'http://insecure.example',
      'ftp://x',
      'courses',
      '?ref=1',
      '/\t/evil.example',
      42,
    ]) {
      expect(isSafeHref(bad), String(bad)).toBe(false)
    }
  })

  it('allows https and site-relative images only', () => {
    expect(isSafeImageUrl('https://x.supabase.co/storage/v1/object/public/a.png')).toBe(true)
    expect(isSafeImageUrl('/images/a.png')).toBe(true)
    expect(isSafeImageUrl('')).toBe(true)
    for (const bad of ['http://x/a.png', 'data:image/png;base64,AAA', 'javascript:x', '//x/a.png']) {
      expect(isSafeImageUrl(bad), bad).toBe(false)
    }
  })

  it('accepts hex colours or empty', () => {
    expect(isSafeColor('')).toBe(true)
    expect(isSafeColor('#3A50B8')).toBe(true)
    expect(isSafeColor('#fff')).toBe(true)
    expect(isSafeColor('red')).toBe(false)
    expect(isSafeColor('#12345')).toBe(false)
  })
})

describe('validatePage (lenient, critique C2)', () => {
  it('passes a legacy page: unknown props, excluded layout blocks and DropZone children are fine', () => {
    const r = pageCatalog.validatePage(page())
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects broken structure', () => {
    expect(pageCatalog.validatePage(null).ok).toBe(false)
    expect(pageCatalog.validatePage({ root: {}, content: {} }).errors[0]).toMatch(/content must be an array/)
    expect(pageCatalog.validatePage({ root: {}, content: [], zones: { x: [] } }).errors[0]).toMatch(/malformed zone key/)
    expect(pageCatalog.validatePage({ root: {}, content: [], zones: { 'a:b': {} } }).errors[0]).toMatch(/must be an array/)
    const noId = pageCatalog.validatePage({ root: {}, content: [{ type: 'HeroBlock', props: {} }] })
    expect(noId.errors[0]).toMatch(/needs props.id/)
    const noType = pageCatalog.validatePage({ root: {}, content: [{ props: { id: 'x' } }] })
    expect(noType.errors[0]).toMatch(/string type/)
  })

  it('rejects duplicate ids across content and zones, and unknown types', () => {
    const data = page()
    data.zones!['c1:column-0'].push({ type: 'TextBlock', props: { id: 'h1' } })
    data.content.push({ type: 'MadeUp', props: { id: 'm1' } })
    const r = pageCatalog.validatePage(data)
    expect(r.errors.join('\n')).toMatch(/"h1"\): duplicate id/)
    expect(r.errors.join('\n')).toMatch(/MadeUp "m1"\): unknown block type/)
  })

  it('rejects unsafe URLs anywhere, including nested items and zones', () => {
    const data = page()
    data.content.push({ type: 'Header', props: { id: 'hd', navLinks: [{ label: 'x', href: 'javascript:alert(1)' }] } })
    data.zones!['c1:column-0'].push({ type: 'Image', props: { id: 'img', src: 'data:image/png;base64,AA' } })
    const r = pageCatalog.validatePage(data)
    expect(r.errors).toHaveLength(2)
    expect(r.errors.join('\n')).toMatch(/navLinks\[0\]\.href: unsafe link/)
    expect(r.errors.join('\n')).toMatch(/src: unsafe image URL/)
  })

  it('checks refs only when the tenant id sets are given', () => {
    expect(pageCatalog.validatePage(page(), { refs: { course: ['12', '34'] } }).ok).toBe(true)
    const r = pageCatalog.validatePage(page(), { refs: { course: [12] } })
    expect(r.errors).toEqual([expect.stringMatching(/e1"\)\.courseId: not this school's course id\(s\): 34/)])
  })

  it('enforces the size caps', () => {
    const many = page({ content: Array.from({ length: PAGE_LIMITS.maxTopLevelBlocks + 1 }, (_, i) => ({ type: 'TextBlock', props: { id: `t${i}` } })) })
    expect(pageCatalog.validatePage(many).errors.join()).toMatch(/top-level blocks/)

    const fat = page()
    fat.content[0].props.subtitle = 'x'.repeat(PAGE_LIMITS.maxBlockPropsBytes)
    expect(pageCatalog.validatePage(fat).errors.join()).toMatch(/props are \d+ bytes/)

    const huge = page({
      content: Array.from({ length: 20 }, (_, i) => ({ type: 'TextBlock', props: { id: `t${i}`, content: 'é'.repeat(14_000) } })),
    })
    expect(pageCatalog.validatePage(huge).errors.join()).toMatch(/page: \d+ bytes exceeds/)
  })

  it('warns (does not fail) on orphan zones', () => {
    const r = pageCatalog.validatePage(page({ zones: { 'gone:main': [] } }))
    expect(r.ok).toBe(true)
    expect(r.warnings[0]).toMatch(/parent block "gone"/)
  })
})
