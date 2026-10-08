/**
 * Template copy in the page's language.
 *
 * Templates are authored once, in English. Instantiating one for a Spanish page swaps every
 * copy string (headings, labels, FAQ answers, placeholder quotes…) for its entry in
 * `TEMPLATE_COPY_ES`, an exact-match dictionary keyed by the template's raw string (binding
 * tokens included, so `© {{year}} {{schoolName}}…` translates before it is substituted).
 *
 * Only prop keys that can hold copy are looked up: hrefs, ids, images, colours, icons and
 * enum tokens never are, so a dictionary entry can not leak into a URL or a select value.
 * `collectTemplateCopy` walks the same keys, and a unit test asserts that every string it
 * finds in every template has a translation.
 *
 * Kept free of the generated files (like `bindings.ts`): the codegen script imports the
 * templates, which import this module through `bindings.ts`.
 */
import { TEMPLATE_COPY_ES } from './template-copy-es'

export const TEMPLATE_LOCALES = ['en', 'es'] as const
export type TemplateLocale = (typeof TEMPLATE_LOCALES)[number]

const DICTIONARIES: Record<TemplateLocale, Readonly<Record<string, string>> | null> = {
  en: null,
  es: TEMPLATE_COPY_ES,
}

/**
 * Prop keys that never hold copy, whatever their value: links, media, colours, icons, layout
 * tokens, and every select/radio field of the manifest (a unit test keeps that list honest).
 */
const NON_COPY_KEY =
  /(^id$|Id$|Ids$|href|Href|url|Url|image|Image|logo$|^icon|Icon$|color|Color|^anchor|embed|^src$|avatar|Avatar|video|Video|email|phone|^type$|^style$|^tone$|^align|^variant|^layout|^columns$|^hideOn$|^level$|^size$|font|Font|^min|^max|^overlay|^spacing|padding|Padding|margin|Margin|^objectFit$|^borderRadius$|^aspectRatio$|^thickness$|^theme$|^columnCount$|^gap$|^verticalAlign$|^stackOnMobile$|^shadow$|^curatedOnly$|^show|^highlighted$|^source$|^useLiveStats$|^reverse$|^pauseOnHover$|^sticky$|^transparent$|^separator$|^height$|^width$)/

/** Alt text is copy even though its key names an image. */
const COPY_KEY = /(^alt$|Alt$)/

export function isCopyKey(key: string): boolean {
  return COPY_KEY.test(key) || !NON_COPY_KEY.test(key)
}

/** Strings that are not copy even under a copy key: tokens only, URLs, numbers, emoji. */
function isCopyValue(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (/^\{\{\s*[a-zA-Z]+\s*\}\}$/.test(v)) return false
  if (/^(https?:|\/|#|mailto:|tel:)/.test(v)) return false
  return /\p{L}/u.test(v)
}

function walk(value: unknown, onCopy: (s: string) => string, key: string | null): unknown {
  if (typeof value === 'string') {
    return key !== null && isCopyKey(key) && isCopyValue(value) ? onCopy(value) : value
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, onCopy, key))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v, onCopy, k)
    return out
  }
  return value
}

/** Is `locale` one the templates are translated into (other than the English source)? */
export function isTemplateLocale(locale: unknown): locale is TemplateLocale {
  return typeof locale === 'string' && (TEMPLATE_LOCALES as readonly string[]).includes(locale)
}

/** A string of template copy in `locale` (the English source when there is no entry). */
export function translateTemplateString(value: string, locale: TemplateLocale | null | undefined): string {
  const dict = locale ? DICTIONARIES[locale] : null
  return dict?.[value] ?? dict?.[value.trim()] ?? value
}

/** A copy of `value` (page data, items, props) with its template copy in `locale`. */
export function localizeTemplateCopy<T>(value: T, locale: TemplateLocale | null | undefined): T {
  if (!locale || !DICTIONARIES[locale]) return value
  return walk(value, (s) => translateTemplateString(s, locale), null) as T
}

/** Every copy string in `value`, as the localizer sees it (for the completeness test). */
export function collectTemplateCopy(value: unknown): Set<string> {
  const found = new Set<string>()
  walk(value, (s) => (found.add(s), s), null)
  return found
}
