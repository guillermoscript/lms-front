/**
 * Deterministic date text for markup that is rendered on the server and
 * hydrated in the browser.
 *
 * `toLocaleDateString(undefined, …)` and date-fns `format` both take the
 * runtime's locale and time zone: the server renders in UTC/en, the browser in
 * the visitor's zone and language, the two strings differ, and React throws
 * #418 on every admin Users row, certificate card and submissions row (#729).
 *
 * Pinning the locale (from next-intl, identical on both sides) and the time
 * zone makes the output a pure function of the input. UTC is the zone the
 * database stores in, so a date-only cell shows the calendar day the row was
 * written on. Do not pass the browser's zone here — that reintroduces the
 * mismatch.
 */
export const DISPLAY_TIME_ZONE = 'UTC'

export const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }

export function formatDate(
  value: string | number | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS
): string {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { timeZone: DISPLAY_TIME_ZONE, ...options }).format(date)
}
