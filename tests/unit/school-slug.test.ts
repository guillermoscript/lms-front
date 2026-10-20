import { describe, it, expect } from 'vitest'
import { RESERVED_SLUGS, validateSchoolSlug } from '@/lib/tenant/school-slug'

describe('validateSchoolSlug', () => {
  it('accepts valid slugs and lowercases/trims', () => {
    expect(validateSchoolSlug('acme')).toEqual({ ok: true, slug: 'acme' })
    expect(validateSchoolSlug('  Code-Academy-2  ')).toEqual({ ok: true, slug: 'code-academy-2' })
    expect(validateSchoolSlug('a1b')).toEqual({ ok: true, slug: 'a1b' })
  })

  it('rejects bad shapes', () => {
    for (const bad of ['', '   ', 'ab', '-acme', 'acme-', 'ac--me', 'ac me', 'ac_me', 'acmé', 'a.b.c', 'acme!']) {
      expect(validateSchoolSlug(bad).ok, bad).toBe(false)
    }
    expect(validateSchoolSlug(null).ok).toBe(false)
    expect(validateSchoolSlug(42).ok).toBe(false)
  })

  it('enforces the 63 character DNS label limit', () => {
    expect(validateSchoolSlug('a'.repeat(63)).ok).toBe(true)
    expect(validateSchoolSlug('a'.repeat(64)).ok).toBe(false)
  })

  it('rejects reserved slugs', () => {
    for (const r of ['www', 'app', 'api', 'admin', 'platform', 'auth', 'localhost', 'WWW']) {
      expect(validateSchoolSlug(r).ok, r).toBe(false)
    }
    expect(RESERVED_SLUGS).toContain('docs')
  })
})
