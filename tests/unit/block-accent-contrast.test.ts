import { describe, expect, it } from 'vitest'

import { AA_CONTRAST, contrastRatio, readableOn } from '@/lib/color/contrast'
import { accentVars } from '@/lib/puck/utils/accent-color'

/**
 * Issue #569 — a landing-page block used to paint an admin's chosen colour and
 * then hardcode a near-white foreground on top of it, so a pale accent rendered
 * white-on-white on the live public pages. `accentVars()` now emits the paired
 * foreground, and these lock the contract the blocks depend on.
 *
 * The colour maths itself is covered in mcp-server/tests/contrast.test.ts,
 * against the mirrored copy of the same helper.
 */

const ACCENT = '--block-accent'
const INK = '--block-accent-foreground'

describe('accentVars', () => {
  it('emits a foreground alongside every explicit accent', () => {
    const vars = accentVars('#0f172a') as Record<string, string>
    expect(vars[ACCENT]).toBe('#0f172a')
    expect(vars[INK]).toBeTruthy()
    expect(contrastRatio(vars[INK], '#0f172a')).toBeGreaterThanOrEqual(AA_CONTRAST)
  })

  it('flips the ink for a pale accent — the white-on-white case', () => {
    const pale = accentVars('#fde047') as Record<string, string>
    const dark = accentVars('#0f172a') as Record<string, string>
    expect(pale[INK]).not.toBe(dark[INK])
    expect(contrastRatio(pale[INK], '#fde047')).toBeGreaterThanOrEqual(AA_CONTRAST)
  })

  it('defers to the tenant brand pair when no override is set', () => {
    for (const empty of ['', '   ', undefined, null]) {
      const vars = accentVars(empty) as Record<string, string>
      expect(vars[ACCENT]).toBe('var(--primary)')
      expect(vars[INK]).toBe('var(--primary-foreground)')
    }
  })

  it('trims the authored value, as the accent half already did', () => {
    const vars = accentVars('  #7c3aed  ') as Record<string, string>
    expect(vars[ACCENT]).toBe('#7c3aed')
  })

  it('keeps the old near-white for a colour it cannot parse', () => {
    const vars = accentVars('var(--something-else)') as Record<string, string>
    expect(vars[ACCENT]).toBe('var(--something-else)')
    expect(vars[INK]).toBe('var(--primary-foreground)')
  })

  it('clears AA for every accent a colour picker can produce', () => {
    const sweep = [
      '#000000', '#0f172a', '#7c3aed', '#dc2626', '#16a34a', '#2563eb',
      '#f59e0b', '#fde047', '#fef3c7', '#ffffff', '#808080', '#5f9ea0',
      'rgb(15, 23, 42)', 'hsl(45, 93%, 47%)',
    ]
    for (const accent of sweep) {
      const vars = accentVars(accent) as Record<string, string>
      expect(contrastRatio(vars[INK], accent), `${accent}`).toBeGreaterThanOrEqual(AA_CONTRAST)
    }
  })
})

describe('readableOn, as the section block uses it', () => {
  it('returns an empty string for an unparseable background so the caller can skip the override', () => {
    expect(readableOn('', '')).toBe('')
    expect(readableOn('url(/bg.png)', '')).toBe('')
  })

  it('gives a light ink on a dark custom section background', () => {
    // The live bug: a dark Section background suppressed the theme class and
    // inherited the page's dark --foreground.
    expect(contrastRatio(readableOn('#0f172a', ''), '#0f172a')).toBeGreaterThanOrEqual(AA_CONTRAST)
  })
})
