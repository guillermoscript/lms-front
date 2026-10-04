import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIME_ZONE,
  formatDateTime,
  isValidTimeZone,
  resolveTimeZone,
} from '@/lib/format-date-time'

/**
 * #727: the student and the admin saw the same `payment_requests.created_at`
 * two hours apart, with English month names on /es. Both sides now format
 * through one helper with an explicit locale and the tenant's IANA zone.
 */
const INSTANT = '2026-09-13T05:11:00Z'

describe('formatDateTime', () => {
  it('renders the same wall-clock time for every caller given the same zone', () => {
    const a = formatDateTime(INSTANT, { locale: 'en', timeZone: 'America/Bogota' })
    const b = formatDateTime(new Date(INSTANT), { locale: 'en', timeZone: 'America/Bogota' })
    expect(a).toBe(b)
    // Bogota is UTC-5: 05:11Z is 12:11 AM local.
    expect(a).toMatch(/12:11/)
    expect(a).toMatch(/Sep/)
  })

  it('shifts with the tenant zone, not the host zone', () => {
    const bogota = formatDateTime(INSTANT, { locale: 'en', timeZone: 'America/Bogota' })
    const madrid = formatDateTime(INSTANT, { locale: 'en', timeZone: 'Europe/Madrid' })
    expect(bogota).not.toBe(madrid)
    expect(madrid).toMatch(/7:11/)
  })

  it('uses the page locale, so /es never shows English month names', () => {
    const es = formatDateTime(INSTANT, { locale: 'es', timeZone: 'UTC', precision: 'date' })
    expect(es).toMatch(/sept?/i)
    expect(es).not.toMatch(/Sep 13/)
  })

  it('date precision drops the time; time precision drops the date', () => {
    const date = formatDateTime(INSTANT, { locale: 'en', timeZone: 'UTC', precision: 'date' })
    const time = formatDateTime(INSTANT, { locale: 'en', timeZone: 'UTC', precision: 'time' })
    expect(date).not.toMatch(/5:11/)
    expect(date).toMatch(/2026/)
    expect(time).toMatch(/5:11/)
    expect(time).not.toMatch(/2026/)
  })

  it('falls back to UTC for an invalid or missing zone instead of throwing', () => {
    const utc = formatDateTime(INSTANT, { locale: 'en', timeZone: 'UTC' })
    expect(formatDateTime(INSTANT, { locale: 'en', timeZone: 'Not/AZone' })).toBe(utc)
    expect(formatDateTime(INSTANT, { locale: 'en', timeZone: null })).toBe(utc)
  })

  it('returns an empty string for empty or unparseable input, never "Invalid Date"', () => {
    expect(formatDateTime(null, { locale: 'en' })).toBe('')
    expect(formatDateTime('', { locale: 'en' })).toBe('')
    expect(formatDateTime('not a date', { locale: 'en' })).toBe('')
  })
})

describe('resolveTimeZone / isValidTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone('America/Caracas')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone(undefined)).toBe(false)
    expect(resolveTimeZone('Mars/Olympus')).toBe(DEFAULT_TIME_ZONE)
    expect(resolveTimeZone('America/Caracas')).toBe('America/Caracas')
  })
})
