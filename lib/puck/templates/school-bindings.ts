import type { TemplateBindings } from './_shared'

/**
 * Template bindings from the school's own settings and the picked course / product
 * (Page Architect WP5, critique D4). Pure: the template picker and the AI's `apply_template`
 * both build their `bindings` here, so a template never ships `{{schoolName}}` or a stale
 * year, and a bundle's CourseGrid lists exactly the product's courses.
 */

/**
 * A `tenant_settings` value is stored either bare or as `{ value }`, and
 * `getAllSettingsByCategory` wraps the stored value once more (`{ value: { value }, description }`),
 * so unwrap every `{ value }` layer.
 */
function settingString(raw: unknown): string {
  let v = raw
  for (let depth = 0; depth < 3 && v && typeof v === 'object' && 'value' in v; depth++) v = (v as { value: unknown }).value
  return typeof v === 'string' ? v.trim() : ''
}

/** Only an image URL the page validator accepts (`https:` or `/`-relative, not `//`). */
function safeLogoUrl(url: string): string {
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    return new URL(url).protocol === 'https:' ? url : ''
  } catch {
    return ''
  }
}

/** `{{schoolName}}` / `{{logoUrl}}` from the general settings (`site_name`, `logo_url`). */
export function schoolBindingsFromSettings(settings: Record<string, unknown> | null | undefined): TemplateBindings {
  const out: TemplateBindings = {}
  const name = settingString(settings?.site_name)
  if (name) out.schoolName = name
  const logo = safeLogoUrl(settingString(settings?.logo_url))
  if (logo) out.logoUrl = logo
  return out
}

/** `{{productId}}` plus the `{{courseIds}}` list of the courses the product grants. */
export function productBindings(product: { id: string; courseIds?: readonly string[] | null }): TemplateBindings {
  return { productId: product.id, courseIds: [...(product.courseIds ?? [])] }
}

/**
 * A `/p/<slug>` slug from a course or product title: lowercase ASCII, accents folded,
 * single dashes, at most 60 characters. Empty when nothing usable is left.
 */
export function slugFromTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}
