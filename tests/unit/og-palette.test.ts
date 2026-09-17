import { describe, it, expect } from 'vitest'
import { ogCardPalette } from '@/lib/og/palette'
import { deriveBrandOutputs } from '@/lib/themes/brand-outputs'
import { contrastRatio, AA_CONTRAST } from '@/lib/color/contrast'
import { KIT_THEME_IDS, KIT_THEMES, type StoredKitTheme } from '@/lib/themes/kit'

/**
 * Unit tests for `lib/og/palette.ts` (issue #765): the `/api/og` share card's
 * colour derivation. Every card colour must come from `BrandOutputs` — no
 * hardcoded purple, no `oklch()` string reaching satori — and the two
 * gradient stops must keep the contract's contrast promises.
 */

const HEX_RE = /^#[0-9A-F]{6}$/
const AAA_CONTRAST = 7

function themes(): (StoredKitTheme | null)[] {
  const stored: (StoredKitTheme | null)[] = [null]
  for (const themeId of KIT_THEME_IDS) {
    const theme = KIT_THEMES[themeId]
    for (const swatch of theme.swatches) {
      stored.push({ type: 'kit', theme: themeId, brand: swatch.hex })
    }
  }
  return stored
}

describe('ogCardPalette', () => {
  for (const theme of themes()) {
    const label = theme ? `${theme.theme}/${theme.brand}` : 'no theme (platform palette)'

    it(`${label}: every field is uppercase #RRGGBB, never oklch()`, () => {
      const palette = ogCardPalette(deriveBrandOutputs(theme))
      for (const [key, value] of Object.entries(palette)) {
        expect(value, `${label}: ${key}`).toMatch(HEX_RE)
        expect(value.toLowerCase(), `${label}: ${key} must not be an oklch() string`).not.toContain('oklch(')
      }
    })

    it(`${label}: primaryText reaches AAA (7:1) on the gradient's near stop`, () => {
      const palette = ogCardPalette(deriveBrandOutputs(theme))
      expect(contrastRatio(palette.primaryText, palette.gradientFrom)).toBeGreaterThanOrEqual(AAA_CONTRAST)
    })

    it(`${label}: secondaryText reaches AA (4.5:1) on both gradient stops`, () => {
      const palette = ogCardPalette(deriveBrandOutputs(theme))
      expect(
        contrastRatio(palette.secondaryText, palette.gradientFrom),
        `${label}: secondaryText on gradientFrom (${palette.gradientFrom})`
      ).toBeGreaterThanOrEqual(AA_CONTRAST)
      expect(
        contrastRatio(palette.secondaryText, palette.gradientTo),
        `${label}: secondaryText on gradientTo (${palette.gradientTo})`
      ).toBeGreaterThanOrEqual(AA_CONTRAST)
    })

    it(`${label}: gradientTo is darker than gradientFrom (moves toward black)`, () => {
      const palette = ogCardPalette(deriveBrandOutputs(theme))
      // A flattened/no-op gradient (gradientTo === gradientFrom) would
      // trivially satisfy a same-anchor contrast comparison, so assert the
      // stops actually differ before checking direction.
      expect(palette.gradientTo).not.toBe(palette.gradientFrom)
      // A darker background can only raise contrast for a light foreground —
      // this pins the direction the contrast tests above rely on.
      expect(contrastRatio('#FFFFFF', palette.gradientTo)).toBeGreaterThanOrEqual(
        contrastRatio('#FFFFFF', palette.gradientFrom)
      )
    })
  }
})
