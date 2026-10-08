import { describe, expect, it } from 'vitest'

import { AA_CONTRAST, contrastRatio, mixOklch } from '@/lib/color/contrast'
import { DEFAULT_KIT_THEME, KIT_THEMES, KIT_THEME_IDS, deriveKitVars } from '@/lib/themes/kit'
import { SECTION_TONES, resolveTonePalette } from '@/lib/puck/utils/section-style'

/**
 * Critique E3: section tones must be readable for every tenant palette, computed
 * rather than eyeballed. Each tone re-scopes the theme variables a block reads
 * (lib/puck/utils/section-style.ts); we resolve those against the real theme-kit
 * derivation and require WCAG AA (4.5:1) for every text/surface pair a block
 * paints body copy with, in light and dark mode.
 */

// The platform default (app/globals.css is deriveKitVars('estructura', '#3A50B8'))
// plus three extreme custom brands (Business+ custom_branding): a near-white
// yellow, a light neon cyan and a near-black red.
const PALETTES: Array<{ name: string; theme: string; brand: string }> = [
  { name: 'platform default', theme: DEFAULT_KIT_THEME, brand: KIT_THEMES[DEFAULT_KIT_THEME].swatches[0].hex },
  { name: 'extreme pale yellow', theme: 'estructura', brand: '#FFF200' },
  { name: 'extreme neon cyan', theme: 'luz', brand: '#00E5FF' },
  { name: 'extreme near-black red', theme: 'andina', brand: '#2A0000' },
  // Every theme on its recommended swatch, so a surface set never slips through.
  ...KIT_THEME_IDS.map((id) => ({ name: `${id} default`, theme: id, brand: KIT_THEMES[id].swatches[0].hex })),
]

/** [text var, surface var] pairs blocks render body copy with. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['--foreground', '--background'],
  ['--muted-foreground', '--background'],
  ['--card-foreground', '--card'],
  ['--muted-foreground', '--card'],
  ['--brand-text', '--background'],
  ['--primary-foreground', '--primary'],
  ['--secondary-foreground', '--secondary'],
]

describe('section tones keep WCAG AA body text', () => {
  for (const palette of PALETTES) {
    const modes = deriveKitVars(palette.theme, palette.brand)
    for (const mode of ['light', 'dark'] as const) {
      for (const tone of SECTION_TONES) {
        it(`${palette.name} · ${mode} · ${tone}`, () => {
          const vars = resolveTonePalette(tone, modes[mode], mixOklch)
          const failures: string[] = []
          for (const [text, surface] of TEXT_PAIRS) {
            const ratio = contrastRatio(vars[text], vars[surface])
            if (!(ratio >= AA_CONTRAST)) {
              failures.push(`${text} on ${surface}: ${ratio.toFixed(2)} (${vars[text]} on ${vars[surface]})`)
            }
          }
          expect(failures).toEqual([])
        })
      }
    }
  }

  it('the section surface is the re-scoped --background (outer fill = inner page)', () => {
    const { light } = deriveKitVars(DEFAULT_KIT_THEME, '#3A50B8')
    expect(resolveTonePalette('brand', light, mixOklch)['--background']).toBe(light['--primary'])
    expect(resolveTonePalette('inverse', light, mixOklch)['--background']).toBe(light['--foreground'])
    expect(resolveTonePalette('muted', light, mixOklch)['--background']).toBe(light['--muted'])
    expect(resolveTonePalette('brand-tint', light, mixOklch)['--background']).toBe(light['--brand-tint'])
  })
})
