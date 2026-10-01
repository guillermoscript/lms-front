/**
 * General settings helpers (#890). Contact/support email are optional: a blank
 * value is stored as `null` (never `''`), a non-blank one must look like an
 * address. Shared by the form (display) and `updateSettings` (the gate).
 */

export const OPTIONAL_EMAIL_SETTING_KEYS = ['contact_email', 'support_email'] as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeOptionalEmail(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false }
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  return EMAIL_RE.test(trimmed) ? { ok: true, value: trimmed } : { ok: false }
}

/**
 * Normalises the optional email keys present in `settings`; other keys pass
 * through untouched. Returns the offending key on the first invalid address.
 */
export function normalizeEmailSettings<T extends { value?: unknown }>(
  settings: Record<string, T>,
): { ok: true; settings: Record<string, T> } | { ok: false; key: string } {
  const out: Record<string, T> = { ...settings }
  for (const key of OPTIONAL_EMAIL_SETTING_KEYS) {
    if (!(key in out)) continue
    const result = normalizeOptionalEmail(out[key]?.value)
    if (!result.ok) return { ok: false, key }
    out[key] = { ...out[key], value: result.value }
  }
  return { ok: true, settings: out }
}

/** The name the form shows: the saved `site_name`, else the school's own name. */
export function defaultSiteName(saved: unknown, tenantName: string | null | undefined): string {
  return typeof saved === 'string' && saved.trim() !== '' ? saved : (tenantName ?? '')
}
