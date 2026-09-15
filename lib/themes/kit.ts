/**
 * Theme kit engine (issues #761, #762; epic #766).
 *
 * A school picks one of four themes and one brand colour; everything else —
 * surfaces, button ink, accent text, tint, focus ring, chart ramp, type
 * pairing, corners, default light/dark mode — is derived here so every
 * combination clears WCAG AA in light and dark mode.
 *
 * Stored as `{ type: 'kit', theme, brand }` in `tenant_settings.theme_preset`
 * (see `StoredPreset` in `./presets`) and resolved by `TenantCssVarsServer`.
 *
 * Derived colours are concrete hex computed in TypeScript rather than CSS
 * `color-mix()`: the unit tests can assert the real contrast ratios, and phase
 * 5 (emails, certificates, OG images) can reuse the same values where
 * `color-mix()` is unavailable.
 */

import { accentTextOn, mixOklch, readableButton } from '@/lib/color/contrast'

import type { CSSVariableMap } from './presets'

export const KIT_THEME_IDS = ['estructura', 'andina', 'kodigo', 'luz'] as const
export type KitThemeId = (typeof KIT_THEME_IDS)[number]
export const DEFAULT_KIT_THEME: KitThemeId = 'estructura'

export const KIT_SURFACE_IDS = ['cool', 'warm', 'neutral', 'dark'] as const
export type KitSurfaceId = (typeof KIT_SURFACE_IDS)[number]

export type KitCornerStyle = 'sharp' | 'soft' | 'round'
export type KitTypePairingId = 'structured' | 'classic' | 'friendly' | 'plain'
/** The next-themes `defaultTheme` for a visitor who has not picked a mode. */
export type KitDefaultMode = 'system' | 'dark'

export interface KitSurface {
  background: string
  foreground: string
  card: string
  muted: string
  mutedForeground: string
  border: string
  dark: boolean
}

/** One of the four neutral surface sets, in both modes. Never tinted by the brand. */
export interface KitSurfaceSet {
  light: KitSurface
  dark: KitSurface
}

export interface KitTheme {
  id: KitThemeId
  surface: KitSurfaceId
  /** Never forced: the mode toggle still switches to the other half of the surface set. */
  defaultMode: KitDefaultMode
  typePairing: KitTypePairingId
  corners: KitCornerStyle
  /** Six `#RRGGBB` brand swatches; the first is the recommended one. */
  swatches: readonly string[]
}

/** Ink on a filled brand button when the button is dark. */
export const KIT_LIGHT_INK = 'oklch(0.99 0 0)'
/** Ink on a filled brand button when the button is light. */
export const KIT_DARK_INK = 'oklch(0.2 0.02 262)'

function surface(
  dark: boolean,
  background: string,
  foreground: string,
  card: string,
  muted: string,
  mutedForeground: string,
  border: string
): KitSurface {
  return { background, foreground, card, muted, mutedForeground, border, dark }
}

// Light values come from the "Platform Brand" design canvas, as does the
// Kódigo dark set; the other dark sets are hue-matched derivations of their
// light values. Cool reuses the Kódigo dark values for its dark half.
const DARK_SET_DARK = surface(
  true,
  'oklch(0.17 0.01 260)',
  'oklch(0.96 0.005 260)',
  'oklch(0.22 0.01 260)',
  'oklch(0.27 0.01 260)',
  'oklch(0.74 0.01 260)',
  'oklch(0.32 0.01 260)'
)

export const KIT_SURFACES: Record<KitSurfaceId, KitSurfaceSet> = {
  cool: {
    light: surface(
      false,
      'oklch(0.985 0.004 250)',
      'oklch(0.2 0.02 262)',
      'oklch(1 0 0)',
      'oklch(0.955 0.006 250)',
      'oklch(0.47 0.02 260)',
      'oklch(0.9 0.01 250)'
    ),
    dark: DARK_SET_DARK,
  },
  warm: {
    light: surface(
      false,
      'oklch(0.975 0.01 85)',
      'oklch(0.22 0.02 60)',
      'oklch(0.992 0.005 85)',
      'oklch(0.945 0.012 85)',
      'oklch(0.47 0.02 70)',
      'oklch(0.88 0.014 85)'
    ),
    dark: surface(
      true,
      'oklch(0.18 0.012 60)',
      'oklch(0.96 0.008 85)',
      'oklch(0.23 0.012 60)',
      'oklch(0.28 0.012 60)',
      'oklch(0.75 0.015 75)',
      'oklch(0.33 0.012 60)'
    ),
  },
  neutral: {
    light: surface(
      false,
      'oklch(0.98 0 0)',
      'oklch(0.2 0 0)',
      'oklch(1 0 0)',
      'oklch(0.955 0 0)',
      'oklch(0.47 0 0)',
      'oklch(0.9 0 0)'
    ),
    dark: surface(
      true,
      'oklch(0.17 0 0)',
      'oklch(0.97 0 0)',
      'oklch(0.22 0 0)',
      'oklch(0.27 0 0)',
      'oklch(0.74 0 0)',
      'oklch(0.32 0 0)'
    ),
  },
  dark: {
    // The light variant a dark theme's mode toggle switches to. What it should
    // look like is still an open owner decision on #766; the values are data
    // only, so revising them touches nothing else.
    light: surface(
      false,
      'oklch(0.98 0.004 260)',
      'oklch(0.17 0.01 260)',
      'oklch(1 0 0)',
      'oklch(0.955 0.005 260)',
      'oklch(0.46 0.01 260)',
      'oklch(0.9 0.008 260)'
    ),
    dark: DARK_SET_DARK,
  },
}

export const KIT_THEMES: Record<KitThemeId, KitTheme> = {
  estructura: {
    id: 'estructura',
    surface: 'cool',
    defaultMode: 'system',
    typePairing: 'structured',
    corners: 'soft',
    swatches: ['#3A50B8', '#0E7C86', '#2F6B4F', '#6B3FA0', '#B5462F', '#2B2F3A'],
  },
  andina: {
    id: 'andina',
    surface: 'warm',
    defaultMode: 'system',
    typePairing: 'classic',
    corners: 'soft',
    swatches: ['#2F6B4F', '#9A3F2C', '#1F4E79', '#8A6414', '#5B3A6E', '#5A3A2A'],
  },
  kodigo: {
    id: 'kodigo',
    surface: 'dark',
    defaultMode: 'dark',
    typePairing: 'plain',
    corners: 'sharp',
    swatches: ['#F2B705', '#3DDC97', '#4CC9F0', '#FF7A3D', '#C8A2FF', '#FF5C8A'],
  },
  luz: {
    id: 'luz',
    surface: 'neutral',
    defaultMode: 'system',
    typePairing: 'friendly',
    corners: 'round',
    swatches: ['#C2185B', '#E4572E', '#7B2CBF', '#0077B6', '#1F9D8F', '#F4A261'],
  },
}

/**
 * The CSS variable `next/font` puts on `<html>` for each kit family. The
 * declarations live in `lib/themes/fonts.ts`, which has to spell these names as
 * literals; `tests/unit/theme-kit-tokens.test.ts` keeps the two in step.
 */
export const KIT_FONT_VARIABLES = {
  'Instrument Sans': '--font-instrument-sans',
  'JetBrains Mono': '--font-jetbrains-mono',
  Lora: '--font-lora',
  'Public Sans': '--font-public-sans',
  Outfit: '--font-outfit',
  Figtree: '--font-figtree',
  'Noto Sans': '--font-noto-sans',
} as const
export type KitFontFamily = keyof typeof KIT_FONT_VARIABLES

const FONT_GENERIC: Record<KitFontFamily, string> = {
  'Instrument Sans': 'ui-sans-serif, system-ui, sans-serif',
  'JetBrains Mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
  Lora: 'ui-serif, Georgia, serif',
  'Public Sans': 'ui-sans-serif, system-ui, sans-serif',
  Outfit: 'ui-sans-serif, system-ui, sans-serif',
  Figtree: 'ui-sans-serif, system-ui, sans-serif',
  'Noto Sans': 'ui-sans-serif, system-ui, sans-serif',
}

/**
 * Families per pairing. `mono: null` keeps the platform monospace for code: a
 * pairing's second face is not a monospace and must never set code.
 */
export const KIT_TYPE_PAIRINGS: Record<
  KitTypePairingId,
  { heading: KitFontFamily; body: KitFontFamily; mono: KitFontFamily | null }
> = {
  structured: { heading: 'Instrument Sans', body: 'Instrument Sans', mono: 'JetBrains Mono' },
  classic: { heading: 'Lora', body: 'Public Sans', mono: null },
  friendly: { heading: 'Outfit', body: 'Figtree', mono: null },
  plain: { heading: 'Noto Sans', body: 'Noto Sans', mono: null },
}

/**
 * Corner radii per style. `button` / `card` / `input` feed the per-component
 * tokens; `base` is `--radius`, which every other rounded surface (menus, tabs,
 * popovers, dialogs) derives from. Round keeps the platform base so a 999px
 * button never turns a menu item into a pill.
 */
export const KIT_CORNERS: Record<
  KitCornerStyle,
  { base: string; button: string; card: string; input: string }
> = {
  sharp: { base: '0.125rem', button: '2px', card: '2px', input: '2px' },
  soft: { base: '0.625rem', button: '8px', card: '10px', input: '8px' },
  round: { base: '0.625rem', button: '999px', card: '20px', input: '14px' },
}

const BRAND_HEX = /^#[0-9a-f]{6}$/i

export function isKitThemeId(v: unknown): v is KitThemeId {
  return typeof v === 'string' && (KIT_THEME_IDS as readonly string[]).includes(v)
}

function kitTheme(theme: unknown): KitTheme {
  return KIT_THEMES[isKitThemeId(theme) ? theme : DEFAULT_KIT_THEME]
}

/** A `#RRGGBB` brand (uppercased), or the theme's recommended swatch for anything else. */
export function normalizeKitBrand(theme: KitThemeId, brand: unknown): string {
  if (typeof brand === 'string') {
    const trimmed = brand.trim()
    if (BRAND_HEX.test(trimmed)) return trimmed.toUpperCase()
  }
  return KIT_THEMES[theme].swatches[0]
}

function deriveMode(s: KitSurface, brand: string): CSSVariableMap {
  const btn = readableButton(brand, {
    dark: s.dark,
    lightInk: KIT_LIGHT_INK,
    darkInk: KIT_DARK_INK,
  })
  const tint = mixOklch(s.card, brand, s.dark ? 0.22 : 0.12) ?? s.card
  const brandText = accentTextOn(brand, [s.background, s.card, tint])

  return {
    '--background': s.background,
    '--foreground': s.foreground,
    '--card': s.card,
    '--card-foreground': s.foreground,
    '--popover': s.card,
    '--popover-foreground': s.foreground,
    '--muted': s.muted,
    '--muted-foreground': s.mutedForeground,
    '--secondary': s.muted,
    '--secondary-foreground': s.foreground,
    // The highlight fill of menu, select and combobox items. Neutral, as in
    // most curated presets: a brand fill under foreground text is unreadable
    // for a dark brand in light mode.
    '--accent': s.muted,
    '--accent-foreground': s.foreground,
    '--border': s.border,
    '--input': s.border,
    '--sidebar': s.dark ? s.card : s.background,
    '--sidebar-foreground': s.foreground,
    '--sidebar-accent': s.muted,
    '--sidebar-accent-foreground': s.foreground,
    '--sidebar-border': s.border,

    '--brand': brand,
    '--primary': btn.background,
    '--primary-foreground': btn.ink,
    '--sidebar-primary': btn.background,
    '--sidebar-primary-foreground': btn.ink,

    '--brand-tint': tint,
    '--brand-text': brandText,
    '--ring': brandText,
    '--sidebar-ring': brandText,

    '--chart-1': mixOklch(brand, '#ffffff', 0.55) ?? brand,
    '--chart-2': mixOklch(brand, '#ffffff', 0.35) ?? brand,
    '--chart-3': mixOklch(brand, '#ffffff', 0.15) ?? brand,
    '--chart-4': brand,
    '--chart-5': mixOklch(brand, '#000000', 0.25) ?? brand,
  }
}

/**
 * The light and dark colour variable maps for a theme + brand. Input is
 * normalized: an unknown theme is Estructura, a brand that is not `#RRGGBB` is
 * the theme's recommended swatch. Fonts and corners are mode-independent and
 * come from `deriveKitStructure`.
 */
export function deriveKitVars(
  theme: unknown,
  brand: unknown
): { light: CSSVariableMap; dark: CSSVariableMap } {
  const t = kitTheme(theme)
  const normalized = normalizeKitBrand(t.id, brand)
  const { light, dark } = KIT_SURFACES[t.surface]
  return { light: deriveMode(light, normalized), dark: deriveMode(dark, normalized) }
}

function fontStack(family: KitFontFamily): string {
  return `var(${KIT_FONT_VARIABLES[family]}), ${FONT_GENERIC[family]}`
}

/**
 * The mode-independent variables for a theme: its type pairing mapped onto
 * `--font-sans` / `--font-heading` (and `--font-mono` when the pairing has a
 * real monospace), and its corner style mapped onto `--radius` plus the
 * per-component radius tokens. An unknown theme is Estructura.
 */
export function deriveKitStructure(theme: unknown): CSSVariableMap {
  const t = kitTheme(theme)
  const type = KIT_TYPE_PAIRINGS[t.typePairing]
  const corners = KIT_CORNERS[t.corners]
  const vars: CSSVariableMap = {
    '--font-sans': fontStack(type.body),
    '--font-heading': fontStack(type.heading),
  }
  if (type.mono) vars['--font-mono'] = fontStack(type.mono)
  vars['--radius'] = corners.base
  vars['--radius-button'] = corners.button
  vars['--radius-card'] = corners.card
  vars['--radius-input'] = corners.input
  return vars
}

/** The next-themes `defaultTheme` for a kit theme; an unknown theme is Estructura's. */
export function kitDefaultMode(theme: unknown): KitDefaultMode {
  return kitTheme(theme).defaultMode
}
