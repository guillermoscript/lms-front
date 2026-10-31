import { describe, expect, it } from 'vitest'
import { fitTitle } from '@/lib/og/fit-title'

const COURSE_BOX = { width: 504, height: 260, maxFont: 60, minFont: 30, lineHeight: 1.1 }

describe('fitTitle', () => {
  it('keeps the largest size for a short title', () => {
    expect(fitTitle('IA para Todos', COURSE_BOX).fontSize).toBe(60)
  })

  it('shrinks until the longest word fits the column', () => {
    const { fontSize } = fitTitle('Inglés Básico para Hispanohablantes', COURSE_BOX)
    // "Hispanohablantes" is 16 chars: it must fit the 504px column at this size.
    expect(16 * fontSize * 0.58).toBeLessThanOrEqual(504)
    expect(fontSize).toBeLessThan(60)
  })

  it('clamps lines instead of overflowing on a very long title', () => {
    const title = 'Curso completo de programación web moderna con React Next.js y Supabase desde cero hasta producción'
    const { fontSize, maxLines } = fitTitle(title, COURSE_BOX)
    expect(fontSize).toBeGreaterThanOrEqual(30)
    expect(maxLines * fontSize * 1.1).toBeLessThanOrEqual(260)
  })

  it('falls back to the minimum for an unbreakable word', () => {
    expect(fitTitle('Supercalifragilisticoespialidosoextraordinario', COURSE_BOX).fontSize).toBe(30)
  })
})
