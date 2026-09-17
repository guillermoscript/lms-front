import type { BrandOutputs, KitHeadingFont } from '@/lib/themes/brand-outputs'

/**
 * The platform certificate design every template starts from. On the Free
 * plan (`certificates: "basic"`, issue #662) this is also the only design a
 * template may carry — colours, logo, signature image and the QR toggle are
 * the `custom` tier. Shared by the editor (initial state) and the save action
 * (what counts as "custom"), so the two can never disagree.
 */
export const DEFAULT_CERTIFICATE_DESIGN = {
  primary_color: '#3B82F6',
  secondary_color: '#1E40AF',
  show_qr_code: true,
} as const

export interface CertificateDesignInput {
  logo_url?: string | null
  signature_image_url?: string | null
  design_settings?: {
    primary_color?: string | null
    secondary_color?: string | null
    show_qr_code?: boolean | null
  } | null
}

/**
 * Anything beyond the platform default design counts as custom — the `custom`
 * certificate tier (Starter+). Used by the save action to refuse below the
 * tier; the editor hides the same controls.
 */
export function hasCustomCertificateDesign(data: CertificateDesignInput): boolean {
  const design = data.design_settings
  return Boolean(
    data.logo_url ||
      data.signature_image_url ||
      (design &&
        ((design.primary_color &&
          design.primary_color.toUpperCase() !== DEFAULT_CERTIFICATE_DESIGN.primary_color) ||
          (design.secondary_color &&
            design.secondary_color.toUpperCase() !== DEFAULT_CERTIFICATE_DESIGN.secondary_color) ||
          design.show_qr_code === false))
  )
}

/** The two colours a template's `design_settings` may carry, before brand resolution. */
export interface CertificateDesignColors {
  primary_color?: string | null
  secondary_color?: string | null
}

/** What a certificate renderer (PDF, HTML view, badge, verify page) actually paints with. */
export interface ResolvedCertificateDesign {
  /** True when the colours were never customised — render the school brand. */
  schoolBranded: boolean
  /** Decorative use: borders, rules, seals, badge fill. */
  primary: string
  /** Decorative use: secondary panels, dark accents. */
  secondary: string
  /** Any brand-coloured TEXT on paper (titles, names) — AA-safe on white, unlike `primary`. */
  accentText: string
  /** The school's heading font, or `null` to keep the renderer's own face (always `null` for a custom template). */
  headingFont: KitHeadingFont | null
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function isDefaultColor(value: string | null | undefined, fallback: string): boolean {
  return !value || value.toUpperCase() === fallback.toUpperCase()
}

/**
 * A template's colour is only ever trusted past this shape check. Both
 * renderers splice these values raw into a `<style>` block served on the
 * public, unauthenticated `/api/certificates/view/[code]` route, so anything
 * that isn't a plain `#RRGGBB` (e.g. a `</style>` breakout) falls back to the
 * platform default instead of reaching the page.
 */
function safeHexColor(value: string | null | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value : fallback
}

/**
 * Resolves what a certificate renders with: the school brand when the design
 * was never customised away from `DEFAULT_CERTIFICATE_DESIGN` (a logo or
 * signature image alone does not count — only the two colours do), or the
 * template's own colours, unchanged, otherwise. Pure — issue #765.
 */
export function resolveCertificateDesign(
  designSettings: CertificateDesignColors | null | undefined,
  brand: BrandOutputs
): ResolvedCertificateDesign {
  const schoolBranded =
    !designSettings ||
    (isDefaultColor(designSettings.primary_color, DEFAULT_CERTIFICATE_DESIGN.primary_color) &&
      isDefaultColor(designSettings.secondary_color, DEFAULT_CERTIFICATE_DESIGN.secondary_color))

  if (schoolBranded) {
    return {
      schoolBranded: true,
      primary: brand.brand,
      secondary: brand.deep,
      accentText: brand.brandText,
      headingFont: brand.headingFont,
    }
  }

  const primary = safeHexColor(designSettings!.primary_color, DEFAULT_CERTIFICATE_DESIGN.primary_color)
  return {
    schoolBranded: false,
    primary,
    secondary: safeHexColor(designSettings!.secondary_color, DEFAULT_CERTIFICATE_DESIGN.secondary_color),
    accentText: primary,
    headingFont: null,
  }
}
