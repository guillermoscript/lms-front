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

export const MAX_SITE_NAME_LENGTH = 120
export const MAX_EMAIL_LENGTH = 254

/**
 * The one gate for the General-settings keys, shared by every `tenant_settings`
 * server-action writer. Every entry must be a plain object; `site_name` is
 * trimmed (blank -> null, capped); the emails are trimmed (blank -> null,
 * validated, capped). Other keys pass through untouched. Returns the offending
 * key on the first invalid entry.
 */
export function normalizeGeneralSettings<T extends { value?: unknown }>(
  settings: Record<string, T>,
): { ok: true; settings: Record<string, T> } | { ok: false; key: string } {
  const out: Record<string, T> = { ...settings }
  for (const key of ['site_name', ...OPTIONAL_EMAIL_SETTING_KEYS]) {
    if (!(key in out)) continue
    const entry = out[key] as unknown
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return { ok: false, key }
    const raw = (entry as { value?: unknown }).value
    if (key === 'site_name') {
      if (raw !== null && raw !== undefined && typeof raw !== 'string') return { ok: false, key }
      const name = typeof raw === 'string' ? raw.trim() : ''
      if (name.length > MAX_SITE_NAME_LENGTH) return { ok: false, key }
      out[key] = { ...out[key], value: name === '' ? null : name }
      continue
    }
    const result = normalizeOptionalEmail(raw)
    if (!result.ok || (result.value !== null && result.value.length > MAX_EMAIL_LENGTH)) {
      return { ok: false, key }
    }
    out[key] = { ...out[key], value: result.value }
  }
  return { ok: true, settings: out }
}

/** The name the form shows: the saved `site_name`, else the school's own name. */
export function defaultSiteName(saved: unknown, tenantName: string | null | undefined): string {
  return typeof saved === 'string' && saved.trim() !== '' ? saved : (tenantName ?? '')
}
