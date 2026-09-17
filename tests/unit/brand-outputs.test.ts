import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  deriveBrandOutputs,
  normalizeLogoUrl,
  PLATFORM_BRAND_CSS,
  KIT_HEADING_FONT_FILES,
  type BrandOutputs,
} from '@/lib/themes/brand-outputs'
import { contrastRatio, AA_CONTRAST } from '@/lib/color/contrast'
import {
  KIT_THEME_IDS,
  KIT_THEMES,
  KIT_TYPE_PAIRINGS,
  type KitThemeId,
  type StoredKitTheme,
} from '@/lib/themes/kit'

/**
 * Unit tests for the orchestrator's contract module `lib/themes/brand-outputs.ts`
 * (issue #765, epic #766). This file only asserts the contract; it never edits
 * `brand-outputs.ts` — a failure here is a bug in that module, reported to the
 * orchestrator by test name.
 */

const HEX_RE = /^#[0-9A-F]{6}$/

const AAA_CONTRAST = 7

function everyColourField(outputs: BrandOutputs): string[] {
  return [
    outputs.brand,
    outputs.button,
    outputs.buttonInk,
    outputs.buttonBorder,
    outputs.brandText,
    outputs.tint,
    outputs.deep,
    outputs.deepInk,
    outputs.deepMuted,
    outputs.paper,
  ]
}

function assertContractInvariants(label: string, outputs: BrandOutputs) {
  for (const field of everyColourField(outputs)) {
    expect(field, `${label}: ${field}`).toMatch(HEX_RE)
    expect(field.toLowerCase(), `${label}: ${field} must not be an oklch() string`).not.toContain('oklch(')
  }

  expect(
    contrastRatio(outputs.button, outputs.buttonInk),
    `${label}: button/buttonInk contrast`
  ).toBeGreaterThanOrEqual(AA_CONTRAST)

  expect(
    contrastRatio(outputs.brandText, outputs.paper),
    `${label}: brandText on paper`
  ).toBeGreaterThanOrEqual(AA_CONTRAST)
  expect(
    contrastRatio(outputs.brandText, outputs.tint),
    `${label}: brandText on tint`
  ).toBeGreaterThanOrEqual(AA_CONTRAST)

  expect(
    contrastRatio(outputs.deepInk, outputs.deep),
    `${label}: deepInk on deep`
  ).toBeGreaterThanOrEqual(AAA_CONTRAST)
  expect(
    contrastRatio(outputs.deepMuted, outputs.deep),
    `${label}: deepMuted on deep`
  ).toBeGreaterThanOrEqual(AA_CONTRAST)

  const borderVsPaper = contrastRatio(outputs.buttonBorder, outputs.paper)
  expect(
    borderVsPaper >= 3 || outputs.buttonBorder === outputs.brandText,
    `${label}: buttonBorder (${outputs.buttonBorder}) must be >=3:1 on paper or equal brandText (${outputs.brandText}); got ratio ${borderVsPaper}`
  ).toBe(true)

  expect(outputs.emailHeadingFontStack, `${label}: emailHeadingFontStack`).not.toContain('var(')
}

describe('deriveBrandOutputs — contract invariants', () => {
  for (const themeId of KIT_THEME_IDS) {
    const theme = KIT_THEMES[themeId]
    for (const swatch of theme.swatches) {
      it(`${themeId} / ${swatch.name} (${swatch.hex}) satisfies every colour invariant`, () => {
        const stored: StoredKitTheme = { type: 'kit', theme: themeId, brand: swatch.hex }
        const outputs = deriveBrandOutputs(stored)
        assertContractInvariants(`${themeId}/${swatch.hex}`, outputs)

        const expectedHeading = KIT_TYPE_PAIRINGS[theme.typePairing].heading
        expect(outputs.headingFont).toBe(expectedHeading)
        expect(outputs.themeId).toBe(themeId)
        expect(outputs.paper).toBe('#FFFFFF')
      })
    }
  }

  // Custom (off-swatch) brand colours, cycled across the four themes so every
  // type pairing's heading font is exercised too.
  const customCases: Array<{ theme: KitThemeId; brand: string }> = [
    { theme: 'estructura', brand: '#FFFF00' },
    { theme: 'andina', brand: '#000000' },
    { theme: 'kodigo', brand: '#FFFFFF' },
    { theme: 'luz', brand: '#777777' },
  ]

  for (const { theme: themeId, brand } of customCases) {
    it(`custom brand ${brand} on ${themeId} satisfies every colour invariant`, () => {
      const stored: StoredKitTheme = { type: 'kit', theme: themeId, brand }
      const outputs = deriveBrandOutputs(stored)
      assertContractInvariants(`${themeId}/${brand}`, outputs)

      const expectedHeading = KIT_TYPE_PAIRINGS[KIT_THEMES[themeId].typePairing].heading
      expect(outputs.headingFont).toBe(expectedHeading)
      expect(outputs.brand).toBe(brand)
    })
  }

  it('null (platform palette) satisfies every colour invariant and has no heading font', () => {
    const outputs = deriveBrandOutputs(null)
    assertContractInvariants('platform', outputs)
    expect(outputs.headingFont).toBeNull()
    expect(outputs.themeId).toBeNull()
    expect(outputs.emailHeadingFontStack).not.toContain('var(')
  })

  it('keeps an off-swatch brand as picked — the plan gate lives in resolveSchoolTheme, not here', () => {
    const stored: StoredKitTheme = { type: 'kit', theme: 'andina', brand: '#123456' }
    const outputs = deriveBrandOutputs(stored)
    expect(outputs.brand).toBe('#123456')
  })
})

describe('PLATFORM_BRAND_CSS', () => {
  it('matches the light-mode --primary and --brand declarations in app/globals.css', () => {
    const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')
    const rootMatch = /:root\s*\{([^}]*)\}/.exec(css)
    expect(rootMatch, ':root block found in app/globals.css').not.toBeNull()
    const rootBlock = rootMatch![1]

    const primaryMatch = /--primary:\s*([^;]+);/.exec(rootBlock)
    const brandMatch = /--brand:\s*([^;]+);/.exec(rootBlock)
    expect(primaryMatch, '--primary declared in :root').not.toBeNull()
    expect(brandMatch, '--brand declared in :root').not.toBeNull()

    expect(primaryMatch![1].trim()).toBe(PLATFORM_BRAND_CSS)
    expect(brandMatch![1].trim()).toBe(PLATFORM_BRAND_CSS)
  })
})

describe('KIT_HEADING_FONT_FILES', () => {
  const TTF_SFNT = Buffer.from([0x00, 0x01, 0x00, 0x00])
  const TTF_TRUE = Buffer.from('true', 'ascii')

  for (const [family, weights] of Object.entries(KIT_HEADING_FONT_FILES)) {
    for (const [weight, filePath] of Object.entries(weights)) {
      it(`${family} ${weight} exists on disk and is a real TrueType file`, () => {
        const absolute = path.join(process.cwd(), filePath)
        const buffer = readFileSync(absolute)
        const signature = buffer.subarray(0, 4)
        const isTrueType = signature.equals(TTF_SFNT) || signature.equals(TTF_TRUE)
        expect(isTrueType, `${filePath} signature ${signature.toString('hex')}`).toBe(true)
      })
    }
  }

  it('has an entry for every heading family any KIT_TYPE_PAIRINGS uses', () => {
    for (const pairing of Object.values(KIT_TYPE_PAIRINGS)) {
      expect(pairing.heading in KIT_HEADING_FONT_FILES, pairing.heading).toBe(true)
    }
  })
})

describe('normalizeLogoUrl', () => {
  it('keeps an https URL', () => {
    expect(normalizeLogoUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png')
  })

  it('keeps an http URL', () => {
    expect(normalizeLogoUrl('http://cdn.example.com/logo.png')).toBe('http://cdn.example.com/logo.png')
  })

  it('rejects a javascript: URL', () => {
    expect(normalizeLogoUrl('javascript:alert(1)')).toBeNull()
  })

  it('rejects a data: URL', () => {
    expect(normalizeLogoUrl('data:image/png;base64,AAAA')).toBeNull()
  })

  it('rejects a relative path', () => {
    expect(normalizeLogoUrl('/uploads/logo.png')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(normalizeLogoUrl('')).toBeNull()
  })

  it('rejects a non-string value', () => {
    expect(normalizeLogoUrl(undefined)).toBeNull()
    expect(normalizeLogoUrl(null)).toBeNull()
    expect(normalizeLogoUrl(42)).toBeNull()
  })
})
