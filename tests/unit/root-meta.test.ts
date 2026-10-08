import { describe, expect, it } from 'vitest'

import { puckConfig, createPuckConfig } from '@/lib/puck/config'
import { readRootMeta, rootMetaFields, safeOgImage } from '@/lib/puck/utils/root-meta'
import messages from '@/messages/en.json'
import esMessages from '@/messages/es.json'

describe('root SEO fields', () => {
  it('config.root exposes metaTitle / metaDescription / ogImage', () => {
    for (const key of ['metaTitle', 'metaDescription', 'ogImage']) {
      expect(puckConfig.root?.fields?.[key as keyof typeof rootMetaFields]).toBeDefined()
      expect((puckConfig.root?.defaultProps as Record<string, string>)[key]).toBe('')
    }
    const t = Object.assign((k: string) => `T(${k})`, { has: () => true })
    const translated = createPuckConfig(t)
    expect(translated.root?.fields?.metaTitle?.label).toBe('T(fieldLabels.SEO Title)')
  })

  it('labels are translated in en and es', () => {
    for (const field of Object.values(rootMetaFields)) {
      const label = field.label as string
      expect((messages.puck.fieldLabels as Record<string, string>)[label]).toBeTruthy()
      expect((esMessages.puck.fieldLabels as Record<string, string>)[label]).toBeTruthy()
    }
  })
})

describe('readRootMeta', () => {
  it('reads and tidies the root props', () => {
    const meta = readRootMeta({
      root: { props: { metaTitle: '  Learn   Guitar ', metaDescription: 'Lessons\nfor all', ogImage: 'https://cdn.test/og.png' } },
      content: [],
    })
    expect(meta).toEqual({ title: 'Learn Guitar', description: 'Lessons for all', image: 'https://cdn.test/og.png' })
  })

  it('omits empty or unusable values', () => {
    expect(readRootMeta({ root: { props: { metaTitle: '  ', ogImage: 'javascript:alert(1)' } } })).toEqual({})
    expect(readRootMeta(null)).toEqual({})
    expect(readRootMeta({})).toEqual({})
    expect(readRootMeta({ root: { props: { metaTitle: 42 } } })).toEqual({})
  })

  it('accepts the legacy root shape (props spread on root)', () => {
    expect(readRootMeta({ root: { metaTitle: 'Old' } })).toEqual({ title: 'Old' })
  })

  it('caps runaway lengths', () => {
    const meta = readRootMeta({ root: { props: { metaTitle: 'x'.repeat(500), metaDescription: 'y'.repeat(1000) } } })
    expect(meta.title!.length).toBeLessThanOrEqual(140)
    expect(meta.description!.length).toBeLessThanOrEqual(320)
  })
})

describe('safeOgImage', () => {
  it.each([
    ['https://cdn.test/a.png', 'https://cdn.test/a.png'],
    ['/og/home.png', '/og/home.png'],
  ])('keeps %j', (input, expected) => expect(safeOgImage(input)).toBe(expected))

  it.each(['http://cdn.test/a.png', 'data:image/png;base64,AAAA', 'javascript:x', '//evil.test/a.png', 'a.png', ''])(
    'drops %j',
    (input) => expect(safeOgImage(input)).toBeUndefined(),
  )
})
