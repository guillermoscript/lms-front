/**
 * Shared HTML fragments for the 7 school-branded transactional emails (issue
 * #765): a school speaks to its own students/members through these, so they
 * carry its logo, brand colour and heading font instead of the platform's
 * hardcoded blue. The 6 platform billing templates (recipient is the school
 * admin, "LMS Platform Billing" footer) do not use this file.
 *
 * `brand.outputs` is already literal `#RRGGBB` designed on white paper
 * (`lib/themes/brand-outputs.ts`) — safe to drop straight into inline styles,
 * unlike `deriveKitVars()`'s `oklch()` strings which no mail client renders.
 */
import type { SchoolBrand } from '@/lib/themes/school-brand'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** An `<img>` logo header, or `''` when the school has no logo. */
export function schoolLogoHeader(brand: SchoolBrand): string {
  if (!brand.logoUrl) return ''
  return `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="40" style="display:block;max-height:40px;width:auto;border:0;margin:0 0 16px" />`
}

/** A filled brand-coloured CTA `<a>` button — the AA-checked button/ink/border triple. */
export function schoolButton(brand: SchoolBrand, href: string, label: string): string {
  const { button, buttonInk, buttonBorder } = brand.outputs
  return `<a href="${href}" style="background:${button};color:${buttonInk};border:1px solid ${buttonBorder};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">${label}</a>`
}

/** Inline `style` value for a heading: brand-coloured text in the theme's heading font. */
export function schoolHeadingStyle(brand: SchoolBrand): string {
  return `color:${brand.outputs.brandText};font-family:${brand.outputs.emailHeadingFontStack}`
}
