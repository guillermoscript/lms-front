/**
 * Pure colour decisions for the `/api/og` share cards (issue #765). Separated
 * from the route so the "no oklch(), every value #RRGGBB, AA/AAA holds on both
 * gradient stops" contract can be unit-tested without rendering satori.
 *
 * `BrandOutputs` is already designed on white paper (`lib/themes/brand-outputs.ts`);
 * the card itself is dark (a share image is read small, often as a thumbnail),
 * so the background is a gradient from `deep` toward black rather than `deep`
 * flat — `deepInk`/`deepMuted` were sized against `deep`, and darkening away
 * from white can only raise their contrast further, never break it.
 */

import { mixOklch } from '@/lib/color/contrast'
import type { BrandOutputs } from '@/lib/themes/brand-outputs'

/** How far the gradient's far stop moves from `deep` toward black. */
const GRADIENT_DARKEN = 0.35

export interface OgCardPalette {
  /** Gradient start — `outputs.deep`. */
  gradientFrom: string
  /** Gradient end — `deep` mixed toward black. */
  gradientTo: string
  /** Title / primary copy — `outputs.deepInk` (AAA on `deep`). */
  primaryText: string
  /** Subtitle / secondary copy — `outputs.deepMuted` (AA on `deep`). */
  secondaryText: string
  /** Accent bars, dots and rules — `outputs.brand`. Decorative only, never text. */
  accent: string
}

export function ogCardPalette(outputs: BrandOutputs): OgCardPalette {
  const gradientTo = (mixOklch(outputs.deep, '#000000', GRADIENT_DARKEN) ?? outputs.deep).toUpperCase()
  return {
    gradientFrom: outputs.deep,
    gradientTo,
    primaryText: outputs.deepInk,
    secondaryText: outputs.deepMuted,
    accent: outputs.brand,
  }
}
