import { describe, expect, it } from 'vitest'
import {
  AA_CONTRAST,
  CARD_DARK,
  CARD_LIGHT,
  DARK_INK,
  LIGHT_INK,
  accentTextOn,
  contrastRatio,
  parseColor,
  readableOn,
  relativeLuminance,
  withAlpha,
} from '../resources/shared/contrast'

/**
 * Contrast helper for author-chosen block colours (issue #569).
 *
 * The bug these guard against: the landing-page-preview widget painted an
 * admin's colour and then hardcoded the foreground, so the published fixture's
 * Stats block (`color: "#0f172a"`) rendered dark-on-dark and its numbers
 * disappeared. Every assertion below is about deriving one colour from the
 * other rather than assuming.
 */

describe('parseColor', () => {
  it('reads every hex length', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255])
    expect(parseColor('#ffff')).toEqual([255, 255, 255])
    expect(parseColor('#0f172a')).toEqual([15, 23, 42])
    // Alpha is dropped — we cannot know what is behind it.
    expect(parseColor('#0f172aff')).toEqual([15, 23, 42])
  })

  it('is case- and whitespace-insensitive', () => {
    expect(parseColor('  #0F172A  ')).toEqual([15, 23, 42])
  })

  it('reads rgb() in both number and percentage form', () => {
    expect(parseColor('rgb(15, 23, 42)')).toEqual([15, 23, 42])
    expect(parseColor('rgb(0 0 0 / 0.5)')).toEqual([0, 0, 0])
    expect(parseColor('rgb(100%, 0%, 0%)')).toEqual([255, 0, 0])
  })

  it('reads hsl()', () => {
    const [r, g, b] = parseColor('hsl(0, 100%, 50%)')!
    expect([Math.round(r), Math.round(g), Math.round(b)]).toEqual([255, 0, 0])
    const white = parseColor('hsl(210 40% 100%)')!
    expect(white.map(Math.round)).toEqual([255, 255, 255])
  })

  it('approximates oklch/lab by lightness, so light and dark are still distinguishable', () => {
    const dark = parseColor('oklch(0.2 0.05 293)')!
    const light = parseColor('oklch(0.95 0.05 293)')!
    expect(relativeLuminance(dark)).toBeLessThan(relativeLuminance(light))
    // lab lightness is 0..100, not 0..1 — a mid value must not read as black.
    expect(relativeLuminance(parseColor('lab(90 20 20)')!)).toBeGreaterThan(0.5)
    expect(relativeLuminance(parseColor('oklch(90% 0.05 293)')!)).toBeGreaterThan(0.5)
  })

  it('resolves the common keywords and refuses everything else', () => {
    expect(parseColor('white')).toEqual([255, 255, 255])
    expect(parseColor('var(--primary)')).toBeNull()
    expect(parseColor('rebeccapurple')).toBeNull()
    expect(parseColor('')).toBeNull()
    expect(parseColor(null)).toBeNull()
    expect(parseColor('not a color')).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('matches the WCAG extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#7c3aed', '#7c3aed')).toBeCloseTo(1, 5)
  })
})

describe('readableOn', () => {
  it('gives light ink on the colour from the issue and dark ink on a pale one', () => {
    // #0f172a is the Stats block colour in the published fixture.
    expect(readableOn('#0f172a')).toBe(LIGHT_INK)
    expect(readableOn('#fde047')).toBe(DARK_INK)
    expect(readableOn('#ffffff')).toBe(DARK_INK)
    expect(readableOn('#7c3aed')).toBe(LIGHT_INK)
  })

  it('clears AA across a sweep of hues and lightnesses', () => {
    const sweep = [
      '#000000', '#0f172a', '#18181b', '#7c3aed', '#dc2626', '#16a34a',
      '#2563eb', '#f59e0b', '#fde047', '#fef3c7', '#e5e7eb', '#ffffff',
      '#64748b', '#94a3b8', '#831843', '#ecfeff',
      // Mid-tones near the crossover, where neither branded ink reaches AA on
      // its own and the helper has to escalate to pure black/white.
      '#767676', '#808080', '#8a8a8a', '#6b8e23', '#5f9ea0',
    ]
    for (const bg of sweep) {
      expect(
        contrastRatio(readableOn(bg), bg),
        `${bg} needs a readable ink`
      ).toBeGreaterThanOrEqual(AA_CONTRAST)
    }
  })

  it('falls back rather than guessing when the colour cannot be parsed', () => {
    expect(readableOn('var(--primary)')).toBe(LIGHT_INK)
    expect(readableOn('var(--primary)', DARK_INK)).toBe(DARK_INK)
  })
})

describe('accentTextOn', () => {
  it('fixes the reported case: a near-black accent as text on the dark card', () => {
    const ink = accentTextOn('#0f172a', CARD_DARK)
    expect(contrastRatio(ink, CARD_DARK)).toBeGreaterThanOrEqual(AA_CONTRAST)
    expect(ink).not.toBe('#0f172a')
  })

  it('leaves an accent alone when it is already legible', () => {
    // Violet on white already clears AA, so the author's colour survives intact.
    expect(accentTextOn('#7c3aed', CARD_LIGHT)).toBe('#7c3aed')
    expect(accentTextOn('#fde047', CARD_DARK)).toBe('#fde047')
  })

  it('handles the inverse case: a pale accent as text on the light card', () => {
    const ink = accentTextOn('#fde047', CARD_LIGHT)
    expect(contrastRatio(ink, CARD_LIGHT)).toBeGreaterThanOrEqual(AA_CONTRAST)
  })

  it('clears AA on both card surfaces for every accent in the sweep', () => {
    const sweep = [
      '#000000', '#0f172a', '#18181b', '#7c3aed', '#dc2626', '#16a34a',
      '#2563eb', '#f59e0b', '#fde047', '#fef3c7', '#e5e7eb', '#ffffff',
    ]
    for (const accent of sweep) {
      for (const surface of [CARD_LIGHT, CARD_DARK]) {
        expect(
          contrastRatio(accentTextOn(accent, surface), surface),
          `${accent} on ${surface}`
        ).toBeGreaterThanOrEqual(AA_CONTRAST)
      }
    }
  })

  it('survives an accent identical to the surface', () => {
    // Nothing of the author's colour can be kept here, but the result must
    // still be legible rather than invisible.
    for (const surface of [CARD_LIGHT, CARD_DARK]) {
      const ink = accentTextOn(surface, surface)
      expect(ink).not.toBe(surface)
      expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(AA_CONTRAST)
    }
  })

  it('returns the input untouched when it cannot be parsed', () => {
    expect(accentTextOn('var(--primary)', CARD_DARK)).toBe('var(--primary)')
  })
})

describe('withAlpha', () => {
  it('produces a color-mix the widget can hand straight to CSS', () => {
    expect(withAlpha('#ffffff', 85)).toBe('color-mix(in srgb, #ffffff 85%, transparent)')
  })
})
