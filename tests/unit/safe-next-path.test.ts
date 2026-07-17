import { describe, expect, it } from 'vitest'
import { getSafeNextPath } from '@/lib/auth/safe-next-path'

describe('getSafeNextPath', () => {
  it('accepts local paths with query parameters', () => {
    expect(getSafeNextPath('/courses/42?enroll=1', '/fallback')).toBe('/courses/42?enroll=1')
  })

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    '/\\evil.example/phish',
    '/%5c%5cevil.example/phish',
    '%2f%2fevil.example/phish',
    '/courses/%00',
  ])('rejects unsafe redirect target %s', (target) => {
    expect(getSafeNextPath(target, '/fallback')).toBe('/fallback')
  })

  it('uses the fallback for malformed encoding', () => {
    expect(getSafeNextPath('/courses/%E0%A4%A', '/fallback')).toBe('/fallback')
  })
})
