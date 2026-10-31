import { describe, expect, it } from 'vitest'
import { parseSlugId, slugify, withSlug } from '@/lib/slug'

describe('slugify', () => {
  it('strips accents and punctuation', () => {
    expect(slugify('Inglés Básico para Hispanohablantes')).toBe('ingles-basico-para-hispanohablantes')
    expect(slugify('  ¡IA para Todos! (2026)  ')).toBe('ia-para-todos-2026')
  })

  it('cuts long titles at a word boundary', () => {
    const slug = slugify('Curso completo de programación web moderna con React, Next.js y Supabase desde cero')
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug.startsWith('curso-completo-de-programacion-web')).toBe(true)
  })

  it('returns empty for titles with no usable characters', () => {
    expect(slugify('日本語')).toBe('')
    expect(slugify(null)).toBe('')
  })
})

describe('withSlug / parseSlugId', () => {
  it('round-trips', () => {
    expect(withSlug(8, 'Inglés Básico')).toBe('8-ingles-basico')
    expect(parseSlugId('8-ingles-basico')).toBe(8)
  })

  it('falls back to the bare id', () => {
    expect(withSlug(8, '日本語')).toBe('8')
    expect(parseSlugId('8')).toBe(8)
  })

  it('rejects non-numeric heads', () => {
    expect(parseSlugId('ingles-8')).toBeNull()
    expect(parseSlugId('')).toBeNull()
    expect(parseSlugId(undefined)).toBeNull()
    expect(parseSlugId('99999999999999999999')).toBeNull()
  })

  it('decodes percent-encoding', () => {
    expect(parseSlugId('8%2Dingles')).toBe(8)
  })
})
