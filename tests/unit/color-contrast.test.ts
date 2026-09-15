import { describe, expect, it } from 'vitest'

import {
  AA_CONTRAST,
  accentTextOn,
  contrastRatio,
  mixOklch,
  oklchToRgb,
  parseColor,
  pickInk,
  readableButton,
  rgbToOklch,
  type Rgb,
} from '@/lib/color/contrast'

/**
 * Issue #761 — real OKLCH/OKLab/Lab/LCH conversion and the helpers the theme
 * kit derives a tenant palette with. The mirrored copy's shared behaviour is
 * covered in mcp-server/tests/contrast.test.ts; parity between the two lives in
 * contrast-mirror-parity.test.ts.
 */

const RED: Rgb = [255, 0, 0]
const GREEN: Rgb = [0, 255, 0]
const BLUE: Rgb = [0, 0, 255]

const LIGHT_INK = 'oklch(0.99 0 0)'
const DARK_INK = 'oklch(0.2 0.02 262)'

function expectRgb(css: string, expected: Rgb, tolerance = 1.5) {
  const rgb = parseColor(css)
  expect(rgb, `${css} should parse`).not.toBeNull()
  rgb!.forEach((channel, i) => {
    expect(
      Math.abs(channel - expected[i]),
      `${css} channel ${i}: got ${channel}, want ${expected[i]}`
    ).toBeLessThanOrEqual(tolerance)
  })
}

describe('parseColor — Lab-family conversion', () => {
  it('converts oklch() to the sRGB primaries', () => {
    expectRgb('oklch(0.627955 0.257683 29.2339)', RED)
    expectRgb('oklch(0.866440 0.294827 142.4953)', GREEN)
    expectRgb('oklch(0.452014 0.313214 264.0520)', BLUE)
  })

  it('converts oklab(), lab() and lch() to red', () => {
    expectRgb('oklab(0.627955 0.224863 0.125846)', RED)
    expectRgb('lab(54.2917 80.8125 69.8851)', RED)
    expectRgb('lch(54.2917 106.839 40.8526)', RED)
  })

  it('reads percentage forms against the CSS reference ranges', () => {
    // oklch: L 100% = 1, C 100% = 0.4.
    expectRgb('oklch(62.7955% 64.42075% 29.2339)', RED)
    // oklab: a/b 100% = 0.4.
    expectRgb('oklab(62.7955% 56.21575% 31.4615%)', RED)
    // lab: L 100% = 100, a/b 100% = 125.
    expectRgb('lab(54.2917% 64.65% 55.908%)', RED)
    // lch: C 100% = 150.
    expectRgb('lch(54.2917 71.226% 40.8526)', RED)
  })

  it('accepts every CSS hue unit', () => {
    expectRgb('oklch(0.627955 0.257683 29.2339deg)', RED)
    expectRgb('oklch(0.627955 0.257683 0.510229rad)', RED)
    expectRgb('oklch(0.627955 0.257683 32.4821grad)', RED)
    expectRgb('oklch(0.627955 0.257683 0.0812053turn)', RED)
    expectRgb('lch(54.2917 106.839 0.113479turn)', RED)
  })

  it('reads none as 0 and drops alpha', () => {
    expect(parseColor('oklch(0.5 none none)')).toEqual(parseColor('oklch(0.5 0 0)'))
    expect(parseColor('lch(50 none 120)')).toEqual(parseColor('lab(50 0 0)'))
    expectRgb('oklch(0.627955 0.257683 29.2339 / 0.4)', RED)
    expectRgb('lab(54.2917 80.8125 69.8851 / 50%)', RED)
  })

  it('maps the achromatic ends to white and black', () => {
    expectRgb('oklch(1 0 0)', [255, 255, 255])
    expectRgb('oklch(0 0 0)', [0, 0, 0])
    expectRgb('lab(100 0 0)', [255, 255, 255])
    expectRgb('lab(0 0 0)', [0, 0, 0])
  })

  it('clips out-of-gamut colours per channel', () => {
    const rgb = parseColor('oklch(0.7 0.4 150)')!
    for (const channel of rgb) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
    }
  })

  it('measures a saturated oklch colour as itself, not a grey', () => {
    // A lightness-only grey of L 0.628 is ~#848484 (4.0:1 on white); real red is 4.0:1
    // too, but blue at L 0.45 is 8.6:1, not the ~7.3:1 its grey would give.
    expect(contrastRatio('oklch(0.452014 0.313214 264.0520)', '#ffffff')).toBeCloseTo(
      contrastRatio('#0000ff', '#ffffff'),
      1
    )
  })

  it('refuses malformed Lab-family input', () => {
    expect(parseColor('oklch(0.5 0.1)')).toBeNull()
    expect(parseColor('oklch(0.5 0.1 12px)')).toBeNull()
    expect(parseColor('lab(abc 0 0)')).toBeNull()
  })

  it('refuses components that overflow instead of leaking NaN channels', () => {
    expect(parseColor('oklch(0.5 1e308 20)')).toBeNull()
    expect(parseColor('oklch(0.5 0.1 1e308)')).toBeNull()
    expect(parseColor('oklab(0.5 1e200 1e200)')).toBeNull()
    expect(parseColor('lab(50 1e308 0)')).toBeNull()
  })
})

describe('rgbToOklch / oklchToRgb', () => {
  it('round-trips an in-gamut colour', () => {
    const source: Rgb = [58, 80, 184]
    const [l, c, h] = rgbToOklch(source)
    expect(l).toBeGreaterThan(0)
    expect(l).toBeLessThan(1)
    expect(c).toBeGreaterThan(0)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(360)
    oklchToRgb(l, c, h).forEach((channel, i) => {
      expect(channel).toBeCloseTo(source[i], 3)
    })
  })

  it('agrees with the reference oklch value for red', () => {
    const [l, c, h] = rgbToOklch(RED)
    expect(l).toBeCloseTo(0.627955, 4)
    expect(c).toBeCloseTo(0.257683, 4)
    expect(h).toBeCloseTo(29.2339, 2)
  })
})

describe('mixOklch', () => {
  it('returns the endpoints at t = 0 and t = 1 as lowercase hex', () => {
    expect(mixOklch('#3A50B8', '#ffffff', 0)).toBe('#3a50b8')
    expect(mixOklch('#3A50B8', '#FFFFFF', 1)).toBe('#ffffff')
  })

  it('keeps the brand hue when mixing toward white or black', () => {
    const [, , brandHue] = rgbToOklch(parseColor('#3A50B8')!)
    for (const target of ['#ffffff', '#000000']) {
      const mixed = mixOklch('#3A50B8', target, 0.4)!
      expect(mixed).toMatch(/^#[0-9a-f]{6}$/)
      const [, , hue] = rgbToOklch(parseColor(mixed)!)
      expect(Math.abs(hue - brandHue), `toward ${target}`).toBeLessThan(3)
    }
  })

  it('moves lightness linearly', () => {
    const [l] = rgbToOklch(parseColor(mixOklch('#000000', '#ffffff', 0.5)!)!)
    expect(l).toBeCloseTo(0.5, 2)
  })

  it('takes the shorter hue arc', () => {
    // Red (~29°) to blue (~264°): the short way passes through magenta (~327°),
    // the long way through green (~147°).
    const [, , hue] = rgbToOklch(parseColor(mixOklch('#ff0000', '#0000ff', 0.5)!)!)
    expect(Math.abs(hue - 326.6)).toBeLessThan(10)
  })

  it('returns null for unparseable input', () => {
    expect(mixOklch('var(--brand)', '#ffffff', 0.5)).toBeNull()
    expect(mixOklch('#ffffff', 'nope', 0.5)).toBeNull()
  })
})

describe('pickInk', () => {
  it('picks the ink with the highest contrast', () => {
    expect(pickInk('#ffffff', [LIGHT_INK, DARK_INK])).toBe(DARK_INK)
    expect(pickInk('#0f172a', [LIGHT_INK, DARK_INK])).toBe(LIGHT_INK)
  })

  it('breaks ties in favour of the earlier ink', () => {
    expect(pickInk('#ffffff', ['#000000', 'black'])).toBe('#000000')
    expect(pickInk('#ffffff', ['black', '#000000'])).toBe('black')
  })
})

describe('readableButton', () => {
  const light = { dark: false, lightInk: LIGHT_INK, darkInk: DARK_INK }
  const dark = { dark: true, lightInk: LIGHT_INK, darkInk: DARK_INK }

  it('keeps the exact input string when an ink already clears AA', () => {
    expect(readableButton('#3A50B8', light)).toEqual({
      background: '#3A50B8',
      ink: LIGHT_INK,
      shifted: false,
    })
    expect(readableButton('oklch(0.9 0.1 90)', dark)).toEqual({
      background: 'oklch(0.9 0.1 90)',
      ink: DARK_INK,
      shifted: false,
    })
  })

  // Neither ink reaches 4.5:1 on these — verified in the first assertion.
  const band = ['#767676', '#0077dd', '#118888', '#cc5577', '#dd3377', '#ee1100']

  it('deepens a shift-band colour toward black on a light surface, with the light ink', () => {
    for (const color of band) {
      expect(
        Math.max(contrastRatio(LIGHT_INK, color), contrastRatio(DARK_INK, color)),
        `${color} should sit in the shift band`
      ).toBeLessThan(AA_CONTRAST)
      const result = readableButton(color, light)
      expect(result.shifted, color).toBe(true)
      expect(result.ink).toBe(LIGHT_INK)
      expect(result.background).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrastRatio(result.ink, result.background), color).toBeGreaterThanOrEqual(AA_CONTRAST)
      const [shiftedL] = rgbToOklch(parseColor(result.background)!)
      const [originalL] = rgbToOklch(parseColor(color)!)
      expect(shiftedL, `${color} should get darker`).toBeLessThan(originalL)
    }
  })

  it('lightens a shift-band colour toward white on a dark surface, with the dark ink', () => {
    for (const color of band) {
      const result = readableButton(color, dark)
      expect(result.shifted, color).toBe(true)
      expect(result.ink).toBe(DARK_INK)
      expect(contrastRatio(result.ink, result.background), color).toBeGreaterThanOrEqual(AA_CONTRAST)
      const [shiftedL] = rgbToOklch(parseColor(result.background)!)
      const [originalL] = rgbToOklch(parseColor(color)!)
      expect(shiftedL, `${color} should get lighter`).toBeGreaterThan(originalL)
    }
  })

  it('shifts by the smallest step that passes', () => {
    const result = readableButton('#767676', light)
    const previous = mixOklch('#767676', '#000000', 0)!
    expect(contrastRatio(LIGHT_INK, previous)).toBeLessThan(AA_CONTRAST)
    expect(result.background).toBe(mixOklch('#767676', '#000000', 0.02))
  })

  it('falls back without shifting when the colour cannot be parsed', () => {
    expect(readableButton('var(--brand)', light)).toEqual({
      background: 'var(--brand)',
      ink: LIGHT_INK,
      shifted: false,
    })
  })
})

describe('accentTextOn with a surface list', () => {
  it('behaves exactly like the single-surface form for a one-item list', () => {
    for (const accent of ['#7c3aed', '#fde047', '#0f172a', '#ffffff']) {
      for (const surface of ['#ffffff', '#18181b']) {
        expect(accentTextOn(accent, [surface])).toBe(accentTextOn(accent, surface))
      }
    }
  })

  it('clears AA on every surface, not just the first', () => {
    const surfaces = ['#ffffff', '#fafafa', '#dde3f7']
    const accent = '#4f63c9'
    // On white alone the accent passes; the tinted surface is what forces a change.
    expect(accentTextOn(accent, surfaces[0])).toBe(accent)
    expect(contrastRatio(accent, surfaces[2])).toBeLessThan(AA_CONTRAST)
    const ink = accentTextOn(accent, surfaces)
    expect(ink).not.toBe(accent)
    for (const surface of surfaces) {
      expect(contrastRatio(ink, surface), surface).toBeGreaterThanOrEqual(AA_CONTRAST)
    }
  })

  it('returns the accent untouched when any surface cannot be parsed', () => {
    expect(accentTextOn('#0f172a', ['#18181b', 'var(--card)'])).toBe('#0f172a')
  })
})
