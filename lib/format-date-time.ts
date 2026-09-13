/**
 * One date/time formatter for every screen that shows the same timestamp to
 * two people (issue #727).
 *
 * The student payment pages formatted with `Intl.DateTimeFormat(undefined, …)`
 * on the server — which is UTC in production and ignores the page locale — while
 * the admin dialog ran date-fns in the browser's own zone. The same
 * `payment_requests.created_at` read 12:11 AM to the buyer and 2:11 AM to the
 * owner, with English month names on the `/es` page. Both sides now pass an
 * explicit BCP 47 locale and the tenant's IANA zone through here.
 *
 * Runs on the server and in the browser; no library, `Intl` only.
 */

export const DEFAULT_TIME_ZONE = 'UTC'

export interface FormatDateTimeOptions {
  /** BCP 47 locale (`en`, `es`, `es-MX`). */
  locale: string
  /** IANA zone (`America/Bogota`). Invalid or missing → UTC. */
  timeZone?: string | null
  /** `date` drops the time-of-day, `time` drops the date; `datetime` (default) keeps both. */
  precision?: 'date' | 'time' | 'datetime'
}

/** `true` when `Intl` accepts the zone; a typo in settings must not crash a page. */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
    return true
  } catch {
    return false
  }
}

export function resolveTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE
}

/**
 * `"13 sept 2026, 14:11"` / `"Sep 13, 2026, 2:11 PM"` — medium date, short
 * time, in the given locale and zone. Returns `''` for an unparseable input
 * rather than the literal `Invalid Date`.
 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: FormatDateTimeOptions
): string {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const precision = options.precision ?? 'datetime'
  return new Intl.DateTimeFormat(options.locale, {
    timeZone: resolveTimeZone(options.timeZone),
    ...(precision !== 'time' ? { dateStyle: 'medium' as const } : {}),
    ...(precision !== 'date' ? { timeStyle: 'short' as const } : {}),
  }).format(date)
}
