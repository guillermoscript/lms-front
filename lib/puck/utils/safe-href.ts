/**
 * Render-side guard for every author- or AI-supplied href on a landing page
 * (Page Architect critique C1: defence in depth behind the save-path
 * validation). Pure module: the server validators can share the same rule.
 */

/** Schemes a landing-page link may use. `http:` is upgraded to https; everything else (javascript:, data:, …) is dropped. */
export const SAFE_HREF_SCHEMES: ReadonlySet<string> = new Set(['https', 'mailto', 'tel'])

/**
 * Allowed: same-site paths (`/courses`), in-page anchors (`#faq`), and
 * `https:`, `mailto:`, `tel:` URLs; `http://host…` and `www.host…` are upgraded to
 * `https://`. Anything else becomes `'#'`, including
 * protocol-relative `//host` and `/\host` (browsers read the backslash as a
 * slash), bare relative paths, and schemes hidden behind whitespace or
 * control characters (`java\tscript:` — browsers strip those before parsing).
 */
export function safeHref(href: unknown): string {
  if (typeof href !== 'string') return '#'
  const value = href.trim()
  if (!value) return '#'
  // Browsers strip tabs/newlines/control chars before parsing, so `/\t/host` is `//host`.
  const compact = value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase()
  if (compact.startsWith('#')) return value
  if (compact.startsWith('/')) {
    const second = compact[1]
    return second === '/' || second === '\\' ? '#' : value
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)?.[1]
  if (scheme && SAFE_HREF_SCHEMES.has(scheme)) return value
  // Links saved before this guard existed: upgrade `http:` and a bare `www.` domain to https
  // instead of breaking them.
  if (scheme === 'http' && /^http:\/\/[^/\\]/i.test(value)) return `https:${value.slice(5)}`
  if (!scheme && /^www\.[a-z0-9-]+\.[a-z]/i.test(value)) return `https://${value}`
  return '#'
}

/** `safeHref` for optional links: `undefined` stays `undefined` (no `href` attribute). */
export function safeOptionalHref(href: unknown): string | undefined {
  return href === undefined || href === null || href === '' ? undefined : safeHref(href)
}
