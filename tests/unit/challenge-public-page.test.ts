import { describe, expect, it } from 'vitest'
import { displayName } from '@/lib/challenges/public-page'

describe('displayName', () => {
  it('first name + last initial', () => {
    expect(displayName('Guillermo Marin')).toBe('Guillermo M.')
    expect(displayName('  ana maría  de la cruz ')).toBe('ana C.')
  })
  it('single name stays as is', () => {
    expect(displayName('Guille')).toBe('Guille')
  })
  it('empty or missing is null so the page renders the guest label', () => {
    expect(displayName(null)).toBeNull()
    expect(displayName('   ')).toBeNull()
  })
})
