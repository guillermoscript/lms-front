import {
  Figtree,
  Geist_Mono,
  Instrument_Sans,
  JetBrains_Mono,
  Lora,
  Noto_Sans,
  Outfit,
  Public_Sans,
} from 'next/font/google'

/**
 * Every font family the platform can render, declared once for the root
 * layout (#762). Each one only sets a CSS variable; `app/globals.css` maps the
 * `--font-sans` / `--font-heading` / `--font-mono` roles onto them, and a theme
 * kit reassigns the roles in `TenantCssVarsServer` (see `deriveKitStructure`).
 *
 * All variables go on `<html>`: a role declared on `:root` can only resolve a
 * variable that is set on that same element.
 *
 * `next/font` only accepts literal options, so the variable names are spelled
 * out here and kept in step with `KIT_FONT_VARIABLES` in `./kit` by
 * `tests/unit/theme-kit-tokens.test.ts`.
 */

// Platform defaults, preloaded on every route.
const notoSans = Noto_Sans({ variable: '--font-noto-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

// Theme kit families. Not preloaded: a file downloads only when a school's
// pairing renders text in it, and `adjustFontFallback` sizes the fallback face
// to the real metrics so the swap does not shift the layout.
const instrumentSans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  preload: false,
  adjustFontFallback: true,
})
const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  preload: false,
  adjustFontFallback: true,
})
const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
  preload: false,
  adjustFontFallback: true,
})
const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  preload: false,
  adjustFontFallback: true,
})
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  preload: false,
  adjustFontFallback: true,
})
const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  preload: false,
  adjustFontFallback: true,
})

/** The class list for `<html>`: one variable class per family. */
export const fontVariables = [
  notoSans,
  geistMono,
  instrumentSans,
  jetBrainsMono,
  lora,
  publicSans,
  outfit,
  figtree,
]
  .map((font) => font.variable)
  .join(' ')
