/**
 * Theme kit engine (issue #761, epic #766).
 *
 * A school picks one of four themes and one brand colour; everything else —
 * surfaces, button ink, accent text, tint, focus ring, chart ramp — is derived
 * here so every combination clears WCAG AA in light and dark mode.
 *
 * Stored as `{ type: 'kit', theme, brand }` in `tenant_settings.theme_preset`
 * (see `StoredPreset` in `./presets`) and resolved by `TenantCssVarsServer`.
 * Type pairings and corner styles are data only here; the CSS/next-font wiring
 * is phase 2 (#762).
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

export type KitCornerStyle = 'sharp' | 'soft' | 'round'
export type KitTypePairingId = 'structured' | 'classic' | 'friendly' | 'plain'

export interface KitSurface {
  background: string
  foreground: string
  card: string
  muted: string
  mutedForeground: string
  border: string
  dark: boolean
}

export interface KitTheme {
  id: KitThemeId
  tone: 'cool' | 'warm' | 'dark' | 'neutral'
  surfaces: { light: KitSurface; dark: KitSurface }
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

// Light values come from the "Platform Brand" design canvas; the non-Kódigo
// dark sets are hue-matched derivations of them.
const COOL_DARK = surface(
  true,
  'oklch(0.17 0.01 260)',
  'oklch(0.96 0.005 260)',
  'oklch(0.22 0.01 260)',
  'oklch(0.27 0.01 260)',
  'oklch(0.74 0.01 260)',
  'oklch(0.32 0.01 260)'
)

export const KIT_THEMES: Record<KitThemeId, KitTheme> = {
  estructura: {
    id: 'estructura',
    tone: 'cool',
    surfaces: {
      light: surface(
        false,
        'oklch(0.985 0.004 250)',
        'oklch(0.2 0.02 262)',
        'oklch(1 0 0)',
        'oklch(0.955 0.006 250)',
        'oklch(0.47 0.02 260)',
        'oklch(0.9 0.01 250)'
      ),
      dark: COOL_DARK,
    },
    typePairing: 'structured',
    corners: 'soft',
    swatches: ['#3A50B8', '#0E7C86', '#2F6B4F', '#6B3FA0', '#B5462F', '#2B2F3A'],
  },
  andina: {
    id: 'andina',
    tone: 'warm',
    surfaces: {
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
    typePairing: 'classic',
    corners: 'soft',
    swatches: ['#2F6B4F', '#9A3F2C', '#1F4E79', '#8A6414', '#5B3A6E', '#5A3A2A'],
  },
  kodigo: {
    id: 'kodigo',
    tone: 'dark',
    surfaces: {
      // PROVISIONAL: whether Kódigo gets a light variant at all is an open
      // owner decision on #766, and phase 2 (#762) owns it. The engine needs
      // *a* light set so every swatch is proven in both modes.
      light: surface(
        false,
        'oklch(0.98 0.004 260)',
        'oklch(0.17 0.01 260)',
        'oklch(1 0 0)',
        'oklch(0.955 0.005 260)',
        'oklch(0.46 0.01 260)',
        'oklch(0.9 0.008 260)'
      ),
      dark: COOL_DARK,
    },
    typePairing: 'plain',
    corners: 'sharp',
    swatches: ['#F2B705', '#3DDC97', '#4CC9F0', '#FF7A3D', '#C8A2FF', '#FF5C8A'],
  },
  luz: {
    id: 'luz',
    tone: 'neutral',
    surfaces: {
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
    typePairing: 'friendly',
    corners: 'round',
    swatches: ['#C2185B', '#E4572E', '#7B2CBF', '#0077B6', '#1F9D8F', '#F4A261'],
  },
}

/** Font family names per pairing. next/font wiring is phase 2 (#762). */
export const KIT_TYPE_PAIRINGS: Record<
  KitTypePairingId,
  { heading: string; body: string; mono: string }
> = {
  structured: { heading: 'Instrument Sans', body: 'Instrument Sans', mono: 'JetBrains Mono' },
  classic: { heading: 'Lora', body: 'Public Sans', mono: 'Public Sans' },
  friendly: { heading: 'Outfit', body: 'Figtree', mono: 'Figtree' },
  plain: { heading: 'Noto Sans', body: 'Noto Sans', mono: 'Noto Sans' },
}

/** Corner radii per style. CSS wiring is phase 2 (#762). */
export const KIT_CORNERS: Record<KitCornerStyle, { button: string; card: string; input: string }> = {
  sharp: { button: '2px', card: '2px', input: '2px' },
  soft: { button: '8px', card: '10px', input: '8px' },
  round: { button: '999px', card: '20px', input: '14px' },
}

const BRAND_HEX = /^#[0-9a-f]{6}$/i

export function isKitThemeId(v: unknown): v is KitThemeId {
  return typeof v === 'string' && (KIT_THEME_IDS as readonly string[]).includes(v)
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
    '--accent': btn.background,
    '--accent-foreground': btn.ink,
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
 * The light and dark CSS variable maps for a theme + brand. Input is
 * normalized: an unknown theme is Estructura, a brand that is not `#RRGGBB` is
 * the theme's recommended swatch. Radius and fonts are not emitted (phase 2).
 */
export function deriveKitVars(
  theme: unknown,
  brand: unknown
): { light: CSSVariableMap; dark: CSSVariableMap } {
  const id = isKitThemeId(theme) ? theme : DEFAULT_KIT_THEME
  const normalized = normalizeKitBrand(id, brand)
  const { light, dark } = KIT_THEMES[id].surfaces
  return { light: deriveMode(light, normalized), dark: deriveMode(dark, normalized) }
}
