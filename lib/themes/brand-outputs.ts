/**
 * A school's brand for surfaces that cannot read CSS variables (issue #765,
 * epic #766): transactional emails, certificates (PDF, HTML view, badge) and
 * OG share images.
 *
 * The web app paints the theme kit with CSS variables (`deriveKitVars`). Mail
 * clients, `@react-pdf`, node-canvas and satori need literal colours and real
 * font files instead, so this module turns a plan-resolved theme into `#RRGGBB`
 * values from the same contrast engine. Everything here is computed against
 * white paper: an email body, a printed certificate and the light half of a
 * share card stay light even for a dark theme (Kódigo), because a mail client
 * or a PDF viewer does not follow the school's default mode.
 *
 * Pure: no I/O. `lib/themes/school-brand.ts` loads a tenant's brand from the
 * database, `lib/themes/brand-fonts.ts` reads the heading font files.
 */

import {
  AA_CONTRAST,
  accentTextOn,
  contrastRatio,
  mixOklch,
  parseColor,
  readableButton,
  toHex,
} from '@/lib/color/contrast'
import {
  DEFAULT_KIT_THEME,
  KIT_DARK_INK,
  KIT_LIGHT_INK,
  KIT_THEMES,
  KIT_TYPE_PAIRINGS,
  normalizeKitBrand,
  type KitThemeId,
  type StoredKitTheme,
} from '@/lib/themes/kit'

function hex(css: string): string {
  const rgb = parseColor(css)
  if (!rgb) throw new Error(`brand-outputs: unparseable colour ${css}`)
  return toHex(rgb).toUpperCase()
}

/**
 * The platform palette's brand: `--brand` / `--primary` in `app/globals.css`
 * (light). A school with no theme renders its outputs in this colour, as the
 * app does. `tests/unit/brand-outputs.test.ts` keeps the two in step.
 *
 * Since #766 that is the default theme's recommended swatch (Estructura /
 * Tinta azul), not a teal of its own — the platform palette and the default
 * theme are the same palette now.
 */
export const PLATFORM_BRAND_CSS = KIT_THEMES[DEFAULT_KIT_THEME].swatches[0].hex
export const PLATFORM_BRAND_HEX = hex(PLATFORM_BRAND_CSS)

/** The paper every output is designed on. */
export const BRAND_PAPER = '#FFFFFF'

const LIGHT_INK_HEX = hex(KIT_LIGHT_INK)
const DARK_INK_HEX = hex(KIT_DARK_INK)

/**
 * The static TTF files (SIL OFL, `public/fonts/kit/`) for every kit heading
 * family, at the two weights the renderers use. Paths are relative to the app
 * root (`process.cwd()`); `public/` ships in the standalone Docker image.
 * `@react-pdf`, node-canvas and satori all need TTF — next/font's WOFF2 files
 * are hashed build output, not a stable path.
 */
export const KIT_HEADING_FONT_FILES = {
  'Instrument Sans': { 400: 'public/fonts/kit/instrument-sans-400.ttf', 700: 'public/fonts/kit/instrument-sans-700.ttf' },
  Lora: { 400: 'public/fonts/kit/lora-400.ttf', 700: 'public/fonts/kit/lora-700.ttf' },
  Outfit: { 400: 'public/fonts/kit/outfit-400.ttf', 700: 'public/fonts/kit/outfit-700.ttf' },
  'Noto Sans': { 400: 'public/fonts/kit/noto-sans-400.ttf', 700: 'public/fonts/kit/noto-sans-700.ttf' },
} as const

export type KitHeadingFont = keyof typeof KIT_HEADING_FONT_FILES
export type KitHeadingFontWeight = 400 | 700

/**
 * Email-safe `font-family` stacks. Most mail clients load no web fonts, so the
 * family name leads (a reader who has it gets it) and the fallback keeps the
 * pairing's character: serif for Lora, sans for the rest.
 */
const EMAIL_SANS_FALLBACK = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const EMAIL_HEADING_STACKS: Record<KitHeadingFont, string> = {
  'Instrument Sans': `'Instrument Sans', ${EMAIL_SANS_FALLBACK}`,
  Lora: "Lora, Georgia, 'Times New Roman', serif",
  Outfit: `Outfit, ${EMAIL_SANS_FALLBACK}`,
  'Noto Sans': `'Noto Sans', ${EMAIL_SANS_FALLBACK}`,
}
export const PLATFORM_EMAIL_FONT_STACK = EMAIL_SANS_FALLBACK

export interface BrandOutputs {
  /** The plan-resolved theme, or `null` on the platform palette. */
  themeId: KitThemeId | null
  /** The brand as picked (`#RRGGBB`). Decorative only — rules, bars, borders, seals. Never text. */
  brand: string
  /** A filled button or badge: the brand, shifted only when neither ink reaches AA on it. */
  button: string
  /** Text on `button` (AA). */
  buttonInk: string
  /**
   * A border for `button`: the button colour itself, or `brandText` when the
   * button is too close to paper to see (a near-white custom brand, < 3:1).
   */
  buttonBorder: string
  /** Brand-coloured text — headings, links, labels — that reaches AA on `paper` and on `tint`. */
  brandText: string
  /** A pale brand wash for panels on paper. */
  tint: string
  /** A deep brand shade for dark panels (share card background, certificate secondary). */
  deep: string
  /** Text on `deep` (AAA, 7:1 — share cards are read small). */
  deepInk: string
  /** Secondary text on `deep`, brand-tinted (AA). */
  deepMuted: string
  /** Always `BRAND_PAPER`. */
  paper: string
  /** The theme's heading family (has files in `KIT_HEADING_FONT_FILES`), or `null`: keep the renderer's own face. */
  headingFont: KitHeadingFont | null
  /** A `font-family` value for email headings. */
  emailHeadingFontStack: string
}

function upper(value: string): string {
  return value.toUpperCase()
}

/** The first shade toward black that `ink` reads on at `ratio`. */
function deepShade(brand: string, ink: string, ratio: number): string {
  for (let step = 8; step <= 19; step++) {
    const mixed = mixOklch(brand, '#000000', step / 20)
    if (mixed && contrastRatio(ink, mixed) >= ratio) return upper(mixed)
  }
  return '#000000'
}

function headingFontOf(themeId: KitThemeId): KitHeadingFont {
  const family = KIT_TYPE_PAIRINGS[KIT_THEMES[themeId].typePairing].heading
  if (!(family in KIT_HEADING_FONT_FILES)) {
    throw new Error(`brand-outputs: no font files for heading family ${family}`)
  }
  return family as KitHeadingFont
}

/**
 * Literal-colour brand values for a plan-resolved theme (`resolveSchoolTheme`),
 * or the platform palette for `null`. Every colour is uppercase `#RRGGBB`.
 */
export function deriveBrandOutputs(theme: StoredKitTheme | null): BrandOutputs {
  const themeId = theme?.theme ?? null
  const brand = themeId ? normalizeKitBrand(themeId, theme?.brand) : PLATFORM_BRAND_HEX

  const btn = readableButton(brand, { dark: false, lightInk: LIGHT_INK_HEX, darkInk: DARK_INK_HEX })
  const tint = upper(mixOklch(BRAND_PAPER, brand, 0.12) ?? BRAND_PAPER)
  const brandText = upper(accentTextOn(brand, [BRAND_PAPER, tint]))

  const deepInk = '#FFFFFF'
  const deep = deepShade(brand, deepInk, 7)
  const muted = mixOklch('#FFFFFF', brand, 0.3)
  const deepMuted = muted && contrastRatio(muted, deep) >= AA_CONTRAST ? upper(muted) : deepInk

  const headingFont = themeId ? headingFontOf(themeId) : null

  return {
    themeId,
    brand,
    button: upper(btn.background),
    buttonInk: upper(btn.ink),
    buttonBorder: contrastRatio(btn.background, BRAND_PAPER) >= 3 ? upper(btn.background) : brandText,
    brandText,
    tint,
    deep,
    deepInk,
    deepMuted,
    paper: BRAND_PAPER,
    headingFont,
    emailHeadingFontStack: headingFont ? EMAIL_HEADING_STACKS[headingFont] : PLATFORM_EMAIL_FONT_STACK,
  }
}

/**
 * A logo URL an email client, PDF renderer or image fetcher may load: an
 * absolute `http(s)` URL, or `null`. `tenant_settings.logo_url` is free text an
 * admin types, so nothing downstream trusts it before this.
 */
export function normalizeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
