import { describe, expect, it } from 'vitest'

import { AA_CONTRAST, contrastRatio, mixOklch, parseColor, rgbToOklch, toHex } from '@/lib/color/contrast'
import {
  DEFAULT_KIT_THEME,
  KIT_DARK_INK,
  KIT_LIGHT_INK,
  KIT_THEME_IDS,
  KIT_THEMES,
  deriveKitVars,
  isKitThemeId,
  normalizeKitBrand,
  type KitThemeId,
} from '@/lib/themes/kit'

/**
 * Issue #761 — the theme kit engine. Every theme × brand × mode the engine can
 * emit has to clear WCAG AA for the pairs the UI actually paints.
 */

const MODES = ['light', 'dark'] as const
const NON_TEXT_CONTRAST = 3

function assertReadable(theme: KitThemeId, brand: string, label: string) {
  const vars = deriveKitVars(theme, brand)
  for (const mode of MODES) {
    const v = vars[mode]
    const at = `${theme} / ${label} / ${mode}`

    expect(
      contrastRatio(v['--primary-foreground'], v['--primary']),
      `${at}: --primary-foreground on --primary (${v['--primary-foreground']} on ${v['--primary']})`
    ).toBeGreaterThanOrEqual(AA_CONTRAST)

    for (const surface of ['--background', '--card', '--brand-tint']) {
      expect(
        contrastRatio(v['--brand-text'], v[surface]),
        `${at}: --brand-text ${v['--brand-text']} on ${surface} ${v[surface]}`
      ).toBeGreaterThanOrEqual(AA_CONTRAST)
    }

    expect(
      contrastRatio(v['--ring'], v['--background']),
      `${at}: --ring on --background`
    ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST)
  }
  return vars
}

/**
 * Colours neither button ink reaches 4.5:1 against — the only ones that make
 * `readableButton` shift. Computed, not hand-picked, so the sweep keeps
 * covering the band if the inks change.
 */
function shiftBandColors(): string[] {
  const band: string[] = []
  for (let r = 0; r < 256; r += 51) {
    for (let g = 0; g < 256; g += 51) {
      for (let b = 0; b < 256; b += 51) {
        const hex = toHex([r, g, b]).toUpperCase()
        const best = Math.max(contrastRatio(KIT_LIGHT_INK, hex), contrastRatio(KIT_DARK_INK, hex))
        if (best < AA_CONTRAST) band.push(hex)
      }
    }
  }
  // Fine-grained greys straddle the crossover exactly.
  for (let v = 0x60; v <= 0x90; v += 4) {
    const hex = toHex([v, v, v]).toUpperCase()
    const best = Math.max(contrastRatio(KIT_LIGHT_INK, hex), contrastRatio(KIT_DARK_INK, hex))
    if (best < AA_CONTRAST) band.push(hex)
  }
  return band
}

describe('theme kit data', () => {
  it('lists exactly the themes it defines', () => {
    expect([...KIT_THEME_IDS].sort()).toEqual(Object.keys(KIT_THEMES).sort())
    for (const id of KIT_THEME_IDS) expect(KIT_THEMES[id].id).toBe(id)
    expect(DEFAULT_KIT_THEME).toBe('estructura')
  })

  it('gives every theme exactly six #RRGGBB swatches', () => {
    for (const id of KIT_THEME_IDS) {
      const { swatches } = KIT_THEMES[id]
      expect(swatches, id).toHaveLength(6)
      for (const swatch of swatches) expect(swatch, `${id} ${swatch}`).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('marks each surface set with the right mode', () => {
    for (const id of KIT_THEME_IDS) {
      expect(KIT_THEMES[id].surfaces.light.dark, id).toBe(false)
      expect(KIT_THEMES[id].surfaces.dark.dark, id).toBe(true)
    }
  })

  it('keeps body and muted text readable on every surface', () => {
    for (const id of KIT_THEME_IDS) {
      for (const mode of MODES) {
        const s = KIT_THEMES[id].surfaces[mode]
        for (const [name, bg] of [
          ['background', s.background],
          ['card', s.card],
          ['muted', s.muted],
        ] as const) {
          expect(
            contrastRatio(s.foreground, bg),
            `${id} / ${mode}: foreground on ${name}`
          ).toBeGreaterThanOrEqual(AA_CONTRAST)
          expect(
            contrastRatio(s.mutedForeground, bg),
            `${id} / ${mode}: muted-foreground on ${name}`
          ).toBeGreaterThanOrEqual(AA_CONTRAST)
        }
      }
    }
  })
})

describe('deriveKitVars — every swatch', () => {
  for (const id of KIT_THEME_IDS) {
    it(`${id}: all six swatches clear AA in light and dark`, () => {
      for (const swatch of KIT_THEMES[id].swatches) {
        const vars = assertReadable(id, swatch, swatch)
        for (const mode of MODES) {
          const v = vars[mode]
          const at = `${id} / ${swatch} / ${mode}`
          expect(v['--brand'], `${at}: --brand`).toBe(swatch)
          // Derived vars mirror each other.
          expect(v['--foreground'], at).toBe(KIT_THEMES[id].surfaces[mode].foreground)
          expect(v['--muted-foreground'], at).toBe(KIT_THEMES[id].surfaces[mode].mutedForeground)
          expect(v['--accent'], at).toBe(v['--primary'])
          expect(v['--accent-foreground'], at).toBe(v['--primary-foreground'])
          expect(v['--sidebar-primary'], at).toBe(v['--primary'])
          expect(v['--sidebar-primary-foreground'], at).toBe(v['--primary-foreground'])
          expect(v['--ring'], at).toBe(v['--brand-text'])
          expect(v['--sidebar-ring'], at).toBe(v['--brand-text'])
          expect(v['--chart-4'], at).toBe(swatch)
        }
      }
    })
  }

  it('surfaces map onto the shadcn tokens', () => {
    const { light, dark } = deriveKitVars('andina', '#2F6B4F')
    const s = KIT_THEMES.andina.surfaces
    expect(light['--background']).toBe(s.light.background)
    expect(light['--card']).toBe(s.light.card)
    expect(light['--popover']).toBe(s.light.card)
    expect(light['--secondary']).toBe(s.light.muted)
    expect(light['--input']).toBe(s.light.border)
    expect(light['--sidebar']).toBe(s.light.background)
    expect(dark['--sidebar']).toBe(s.dark.card)
    // The tint is 12% brand into the card in light mode, 22% on dark surfaces.
    expect(light['--brand-tint']).toBe(mixOklch(s.light.card, '#2F6B4F', 0.12))
    expect(dark['--brand-tint']).toBe(mixOklch(s.dark.card, '#2F6B4F', 0.22))
    for (const v of [light, dark]) {
      expect(v['--brand-tint']).toMatch(/^#[0-9a-f]{6}$/)
      for (const n of [1, 2, 3, 5]) expect(v[`--chart-${n}`]).toMatch(/^#[0-9a-f]{6}$/)
      // The chart ramp runs from lightest (--chart-1) to darkest (--chart-5).
      const lightness = [1, 2, 3, 4, 5].map((n) => rgbToOklch(parseColor(v[`--chart-${n}`])!)[0])
      for (let i = 1; i < lightness.length; i++) {
        expect(lightness[i - 1], `--chart-${i} lighter than --chart-${i + 1}`).toBeGreaterThan(lightness[i])
      }
    }
  })

  it('emits no radius or font variables (phase 2 owns them)', () => {
    const { light, dark } = deriveKitVars('luz', '#C2185B')
    for (const key of [...Object.keys(light), ...Object.keys(dark)]) {
      expect(key).not.toBe('--radius')
      expect(key.startsWith('--font')).toBe(false)
    }
  })
})

describe('deriveKitVars — arbitrary brands', () => {
  const named = [
    '#1F9D8F', '#E4572E', '#F4A261',
    '#000000', '#FFFFFF', '#767676',
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  ]
  const band = shiftBandColors()

  it('finds colours in the shift band to test against', () => {
    expect(band.length).toBeGreaterThan(5)
    // #767676 is in the named sweep and sits in the band too.
    expect(
      Math.max(contrastRatio(KIT_LIGHT_INK, '#767676'), contrastRatio(KIT_DARK_INK, '#767676'))
    ).toBeLessThan(AA_CONTRAST)
  })

  it('clears AA for every brand in every theme and mode', () => {
    for (const id of KIT_THEME_IDS) {
      for (const brand of [...named, ...band]) {
        const vars = assertReadable(id, brand, brand)
        expect(vars.light['--brand'], `${id} / ${brand}`).toBe(brand)
      }
    }
  })

  it('shifts a shift-band brand in light and in dark mode', () => {
    let shiftedLight = 0
    let shiftedDark = 0
    for (const brand of band) {
      const { light, dark } = deriveKitVars('estructura', brand)
      if (light['--primary'] !== light['--brand']) shiftedLight++
      if (dark['--primary'] !== dark['--brand']) shiftedDark++
    }
    expect(shiftedLight, 'at least one brand shifted in light mode').toBeGreaterThan(0)
    expect(shiftedDark, 'at least one brand shifted in dark mode').toBeGreaterThan(0)

    const grey = deriveKitVars('estructura', '#767676')
    expect(grey.light['--primary']).not.toBe('#767676')
    expect(grey.light['--primary-foreground']).toBe(KIT_LIGHT_INK)
    expect(grey.dark['--primary']).not.toBe('#767676')
    expect(grey.dark['--primary-foreground']).toBe(KIT_DARK_INK)
  })

  it('keeps a legible brand unshifted', () => {
    for (const brand of ['#1F9D8F', '#E4572E', '#F4A261', '#3A50B8', '#000000']) {
      const { light, dark } = deriveKitVars('estructura', brand)
      expect(light['--primary'], `${brand} light`).toBe(brand)
      expect(dark['--primary'], `${brand} dark`).toBe(brand)
    }
  })
})

describe('deriveKitVars — normalization', () => {
  it('falls back to Estructura for an unknown theme', () => {
    const expected = deriveKitVars('estructura', '#0E7C86')
    for (const theme of ['nope', '', null, undefined, 42, { id: 'luz' }]) {
      expect(deriveKitVars(theme, '#0E7C86'), String(theme)).toEqual(expected)
    }
  })

  it("falls back to the theme's first swatch for a bad brand", () => {
    for (const id of KIT_THEME_IDS) {
      const expected = deriveKitVars(id, KIT_THEMES[id].swatches[0])
      for (const brand of ['red', '#fff', 'oklch(0.5 0.1 30)', null, 42, undefined, '#12345G']) {
        expect(deriveKitVars(id, brand), `${id} / ${String(brand)}`).toEqual(expected)
        expect(normalizeKitBrand(id, brand)).toBe(KIT_THEMES[id].swatches[0])
      }
    }
  })

  it('accepts lowercase and padded hex, uppercasing it', () => {
    expect(normalizeKitBrand('luz', '  #1f9d8f ')).toBe('#1F9D8F')
    expect(deriveKitVars('luz', '#1f9d8f')).toEqual(deriveKitVars('luz', '#1F9D8F'))
    expect(deriveKitVars('luz', '#1f9d8f').light['--brand']).toBe('#1F9D8F')
  })

  it('isKitThemeId only accepts the four ids', () => {
    for (const id of KIT_THEME_IDS) expect(isKitThemeId(id)).toBe(true)
    for (const v of ['Estructura', 'kódigo', '', null, 1]) expect(isKitThemeId(v)).toBe(false)
  })
})
