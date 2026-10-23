import { describe, expect, it } from 'vitest'
import { extractGlobalParts, pageUsesGlobalParts, stripGlobalParts } from '@/lib/puck/utils/global-parts'

const page = {
  root: { props: {} },
  content: [
    { type: 'Header', props: { logoText: 'H' } },
    { type: 'Hero', props: {} },
    { type: 'Footer', props: { copyright: 'F' } },
  ],
}

describe('global parts', () => {
  it('extracts the first header and footer', () => {
    const parts = extractGlobalParts(page)
    expect(parts.header?.props.logoText).toBe('H')
    expect(parts.footer?.props.copyright).toBe('F')
  })

  it('returns nulls for missing or malformed data', () => {
    expect(extractGlobalParts(null)).toEqual({ header: null, footer: null })
    expect(extractGlobalParts({ content: 'x' })).toEqual({ header: null, footer: null })
  })

  it('strips only the parts that exist globally', () => {
    const parts = extractGlobalParts(page)
    const out = stripGlobalParts(page as never, { header: parts.header, footer: null })
    expect(out.content.map((b) => b.type)).toEqual(['Hero', 'Footer'])
  })

  it('honours the page-level opt-out', () => {
    expect(pageUsesGlobalParts(page)).toBe(true)
    expect(pageUsesGlobalParts({ root: { props: { globalParts: 'hide' } } })).toBe(false)
    expect(pageUsesGlobalParts({ root: { globalParts: 'hide' } })).toBe(false)
    expect(pageUsesGlobalParts({ root: { props: { globalParts: 'show' } } })).toBe(true)
  })
})
