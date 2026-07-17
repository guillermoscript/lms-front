import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('vitest baseline', () => {
  it('runs and evaluates basic assertions', () => {
    expect(1 + 1).toBe(2)
  })

  it('resolves the @/ path alias and TypeScript modules from lib/', () => {
    // cn is a plain exported helper (no I/O), so importing + calling it proves
    // Vitest can resolve "@/..." and compile project TS without a build.
    expect(cn).toBeTypeOf('function')
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })
})
