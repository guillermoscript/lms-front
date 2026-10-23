import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroSplit } from '@/lib/puck/components/lms/hero-split'
import { StepsBlock } from '@/lib/puck/components/lms/steps-block'
import { ContentFeature } from '@/lib/puck/components/lms/content-feature'
import { FeaturesGrid } from '@/lib/puck/components/lms/features-grid'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const html = (c: any, props: object) =>
  renderToStaticMarkup(c.render({ ...c.defaultProps, ...props, puck: {} }))

describe('landing blocks', () => {
  it('HeroSplit renders eyebrow, highlights and image', () => {
    const out = html(HeroSplit, { eyebrow: 'Hola', highlights: 'Uno\nDos', imageUrl: 'https://x.test/a.webp', imageAlt: 'alt' })
    expect(out).toContain('Hola')
    expect(out).toContain('Dos')
    expect(out).toContain('object-cover')
  })
  it('StepsBlock numbers its steps and tolerates missing items', () => {
    expect(html(StepsBlock, {})).toContain('01')
    expect(() => html(StepsBlock, { items: undefined })).not.toThrow()
  })
  it('ContentFeature renders bullets inside the text column', () => {
    expect(html(ContentFeature, { bullets: 'a\nb', imageUrl: 'https://x.test/a.webp' })).toContain('<li')
  })
  it('FeaturesGrid renders an icon name as an svg, not as text', () => {
    const out = html(FeaturesGrid, { items: [{ icon: 'sparkles', title: 'T', description: 'D' }] })
    expect(out).toContain('<svg')
    expect(out).not.toContain('>sparkles<')
  })
})
