import { describe, expect, it } from 'vitest'
import { humanizeBlockType, typeFromId } from '@/components/admin/landing-page/page-architect/tool-line'

describe('typeFromId', () => {
  it('names a block that left the page from its `<Type>-<suffix>` id', () => {
    expect(typeFromId('CourseHero-j6vau7j3f1', humanizeBlockType)).toBe('Course hero')
    expect(typeFromId('HeroBlock-0b4f6a3e-2d7c-4c1e-9d8a-5d2a1f0e9b7c', humanizeBlockType)).toBe('Hero block')
  })

  it('returns null for an id that does not carry a type', () => {
    expect(typeFromId('hero-1', humanizeBlockType)).toBeNull()
    expect(typeFromId('', humanizeBlockType)).toBeNull()
  })
})
