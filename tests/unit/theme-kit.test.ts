import { describe, expect, it } from 'vitest'

import { AA_CONTRAST, contrastRatio, mixOklch, parseColor, rgbToOklch, toHex } from '@/lib/color/contrast'
import {
  DEFAULT_KIT_THEME,
  KIT_CORNERS,
  KIT_DARK_INK,
  KIT_FONT_VARIABLES,
  KIT_LIGHT_INK,
  KIT_SURFACE_IDS,
  KIT_SURFACES,
  KIT_THEME_IDS,
  KIT_THEMES,
  KIT_TYPE_PAIRINGS,
  defaultThemeFor,
  deriveKitStructure,
  deriveKitVars,
  isKitThemeId,
  kitDefaultMode,
  normalizeKitBrand,
  type KitThemeId,
} from '@/lib/themes/kit'
import type { StoredPreset } from '@/lib/themes/presets'

/**
 * Issues #761 and #762 — the theme kit engine. Every theme × brand × mode the
 * engine can emit has to clear WCAG AA for the pairs the UI actually paints,
 * and the surface a theme sits on must never move with the brand.
 */

const MODES = ['light', 'dark'] as const
const NON_TEXT_CONTRAST = 3

/** The tokens a surface set owns. None of them may depend on the brand. */
const SURFACE_KEYS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--muted',
  '--muted-foreground',
  '--secondary',
  '--secondary-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
]

const surfaceOf = (theme: KitThemeId) => KIT_SURFACES[KIT_THEMES[theme].surface]

function assertReadable(theme: KitThemeId, brand: string, label: string) {
  const vars = deriveKitVars(theme, brand)
  for (const mode of MODES) {
    const v = vars[mode]
    const at = `${theme} / ${label} / ${mode}`

    expect(
      contrastRatio(v['--primary-foreground'], v['--primary']),
      `${at}: --primary-foreground on --primary (${v['--primary-foreground']} on ${v['--primary']})`
    ).toBeGreaterThanOrEqual(AA_CONTRAST)

    expect(
      contrastRatio(v['--accent-foreground'], v['--accent']),
      `${at}: --accent-foreground on --accent`
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

  it('defines four surface sets and seats each theme on its own', () => {
    expect([...KIT_SURFACE_IDS].sort()).toEqual(Object.keys(KIT_SURFACES).sort())
    expect(Object.fromEntries(KIT_THEME_IDS.map((id) => [id, KIT_THEMES[id].surface]))).toEqual({
      estructura: 'cool',
      andina: 'warm',
      kodigo: 'dark',
      luz: 'neutral',
    })
  })

  it('marks each surface set with the right mode', () => {
    for (const id of KIT_SURFACE_IDS) {
      expect(KIT_SURFACES[id].light.dark, id).toBe(false)
      expect(KIT_SURFACES[id].dark.dark, id).toBe(true)
    }
  })

  it('keeps body and muted text readable on every surface', () => {
    for (const id of KIT_SURFACE_IDS) {
      for (const mode of MODES) {
        const s = KIT_SURFACES[id][mode]
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

  it('opens only Kódigo in dark mode', () => {
    expect(Object.fromEntries(KIT_THEME_IDS.map((id) => [id, KIT_THEMES[id].defaultMode]))).toEqual({
      estructura: 'system',
      andina: 'system',
      kodigo: 'dark',
      luz: 'system',
    })
  })
})

describe('deriveKitVars — every swatch', () => {
  for (const id of KIT_THEME_IDS) {
    it(`${id}: all six swatches clear AA in light and dark`, () => {
      for (const swatch of KIT_THEMES[id].swatches) {
        const vars = assertReadable(id, swatch, swatch)
        for (const mode of MODES) {
          const v = vars[mode]
          const s = surfaceOf(id)[mode]
          const at = `${id} / ${swatch} / ${mode}`
          expect(v['--brand'], `${at}: --brand`).toBe(swatch)
          // Derived vars mirror each other.
          expect(v['--foreground'], at).toBe(s.foreground)
          expect(v['--muted-foreground'], at).toBe(s.mutedForeground)
          expect(v['--accent'], at).toBe(s.muted)
          expect(v['--accent-foreground'], at).toBe(s.foreground)
          expect(v['--sidebar-primary'], at).toBe(v['--primary'])
          expect(v['--sidebar-primary-foreground'], at).toBe(v['--primary-foreground'])
          expect(v['--ring'], at).toBe(v['--brand-text'])
          expect(v['--sidebar-ring'], at).toBe(v['--brand-text'])
          expect(v['--chart-4'], at).toBe(swatch)
        }
      }
    })
  }

  it('never lets the brand move a surface token', () => {
    for (const id of KIT_THEME_IDS) {
      const base = deriveKitVars(id, KIT_THEMES[id].swatches[0])
      for (const brand of [...KIT_THEMES[id].swatches, '#000000', '#FFFFFF', '#767676', '#FF0000']) {
        const vars = deriveKitVars(id, brand)
        for (const mode of MODES) {
          for (const key of SURFACE_KEYS) {
            expect(vars[mode][key], `${id} / ${brand} / ${mode}: ${key}`).toBe(base[mode][key])
          }
        }
      }
    }
  })

  it('surfaces map onto the shadcn tokens', () => {
    const { light, dark } = deriveKitVars('andina', '#2F6B4F')
    const s = KIT_SURFACES.warm
    expect(light['--background']).toBe(s.light.background)
    expect(light['--card']).toBe(s.light.card)
    expect(light['--popover']).toBe(s.light.card)
    expect(light['--secondary']).toBe(s.light.muted)
    expect(light['--accent']).toBe(s.light.muted)
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

  it('emits colours only; fonts and corners come from deriveKitStructure', () => {
    const { light, dark } = deriveKitVars('luz', '#C2185B')
    for (const key of [...Object.keys(light), ...Object.keys(dark)]) {
      expect(key.startsWith('--radius')).toBe(false)
      expect(key.startsWith('--font')).toBe(false)
    }
  })
})

describe('deriveKitStructure', () => {
  const stackOf = (variable: string) => new RegExp(`^var\\(${variable}\\), \\S`)

  it("maps every theme's type pairing and corners onto the role tokens", () => {
    for (const id of KIT_THEME_IDS) {
      const vars = deriveKitStructure(id)
      const type = KIT_TYPE_PAIRINGS[KIT_THEMES[id].typePairing]
      const corners = KIT_CORNERS[KIT_THEMES[id].corners]

      expect(vars['--font-sans'], id).toMatch(stackOf(KIT_FONT_VARIABLES[type.body]))
      expect(vars['--font-heading'], id).toMatch(stackOf(KIT_FONT_VARIABLES[type.heading]))
      if (type.mono) expect(vars['--font-mono'], id).toMatch(stackOf(KIT_FONT_VARIABLES[type.mono]))
      else expect(vars, id).not.toHaveProperty('--font-mono')

      expect(vars['--radius'], id).toBe(corners.base)
      expect(vars['--radius-button'], id).toBe(corners.button)
      expect(vars['--radius-card'], id).toBe(corners.card)
      expect(vars['--radius-input'], id).toBe(corners.input)
    }
  })

  it('spells out Estructura', () => {
    expect(deriveKitStructure('estructura')).toEqual({
      '--font-sans': 'var(--font-instrument-sans), ui-sans-serif, system-ui, sans-serif',
      '--font-heading': 'var(--font-instrument-sans), ui-sans-serif, system-ui, sans-serif',
      '--font-mono': 'var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
      '--radius': '0.625rem',
      '--radius-button': '8px',
      '--radius-card': '10px',
      '--radius-input': '8px',
    })
  })

  it('gives a serif heading a serif fallback and keeps the platform mono for code', () => {
    const andina = deriveKitStructure('andina')
    expect(andina['--font-heading']).toBe('var(--font-lora), ui-serif, Georgia, serif')
    expect(andina['--font-sans']).toBe('var(--font-public-sans), ui-sans-serif, system-ui, sans-serif')
    expect(andina).not.toHaveProperty('--font-mono')
  })

  it('soft corners reproduce the platform defaults', () => {
    // app/globals.css: --radius 0.625rem (10px), button/input = radius - 2px, card = radius.
    expect(KIT_CORNERS.soft).toEqual({ base: '0.625rem', button: '8px', card: '10px', input: '8px' })
  })

  it('round keeps the platform base radius so menus, tabs and popovers do not change', () => {
    const luz = deriveKitStructure('luz')
    expect(luz['--radius']).toBe(KIT_CORNERS.soft.base)
    expect(luz['--radius-button']).toBe('999px')
    expect(luz['--radius-card']).toBe('20px')
    expect(luz['--radius-input']).toBe('14px')
  })

  it('sharp tightens the base radius to match its 2px controls', () => {
    const kodigo = deriveKitStructure('kodigo')
    expect(kodigo['--radius']).toBe('0.125rem')
    for (const key of ['--radius-button', '--radius-card', '--radius-input']) expect(kodigo[key]).toBe('2px')
  })

  it('treats an unknown theme as Estructura', () => {
    for (const theme of ['nope', '', null, undefined, 42]) {
      expect(deriveKitStructure(theme), String(theme)).toEqual(deriveKitStructure('estructura'))
    }
  })
})

describe('kitDefaultMode', () => {
  it('is dark for Kódigo and system for every other theme', () => {
    expect(kitDefaultMode('kodigo')).toBe('dark')
    for (const id of ['estructura', 'andina', 'luz']) expect(kitDefaultMode(id), id).toBe('system')
  })

  it('treats an unknown theme as Estructura', () => {
    for (const theme of ['Kodigo', '', null, undefined]) expect(kitDefaultMode(theme)).toBe('system')
  })
})

describe('defaultThemeFor (the layout reads its next-themes default from this)', () => {
  it('opens a Kódigo kit dark', () => {
    expect(defaultThemeFor({ type: 'kit', theme: 'kodigo', brand: '#F2B705' })).toBe('dark')
  })

  it('keeps every other preset, and no preset, on the system mode', () => {
    for (const id of ['estructura', 'andina', 'luz'] as const) {
      expect(defaultThemeFor({ type: 'kit', theme: id, brand: '#000000' }), id).toBe('system')
    }
    expect(defaultThemeFor({ type: 'curated', id: 'default' })).toBe('system')
    expect(defaultThemeFor({ type: 'custom', id: 'x' })).toBe('system')
    expect(defaultThemeFor(null)).toBe('system')
    expect(defaultThemeFor(undefined)).toBe('system')
  })

  it('treats a malformed kit preset as Estructura, which is system', () => {
    // tenant_settings is jsonb: what comes back is not guaranteed to match the type.
    const stored = (value: unknown) => value as StoredPreset
    expect(defaultThemeFor(stored({ type: 'kit' }))).toBe('system')
    expect(defaultThemeFor(stored({ type: 'kit', theme: 'Kodigo' }))).toBe('system')
    // A dark theme stored under a non-kit type never opens dark.
    expect(defaultThemeFor(stored({ type: 'curated', id: 'x', theme: 'kodigo' }))).toBe('system')
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
