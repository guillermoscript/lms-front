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
