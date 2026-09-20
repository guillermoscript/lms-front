import { describe, it, expect } from 'vitest'
import {
  isManualRequestOpen,
  isManualRequestExpirable,
  manualRequestExpiresAt,
  manualReminderDueAt,
  MANUAL_REQUEST_TTL_DAYS,
  MANUAL_REQUEST_REMINDER_LEAD_DAYS,
  OPEN_MANUAL_REQUEST_STATUSES,
  EXPIRABLE_MANUAL_REQUEST_STATUSES,
  type ManualRequestTtlRow,
} from '@/lib/payments/manual-request-ttl'

/**
 * TTL rules for student-facing payment_requests (issue #802) — the student-side
 * twin of the school-facing rules from #546. See lib/payments/manual-request-ttl.ts
 * for why these two predicates must never both be true for the same row.
 */

const NOW = new Date('2026-09-20T00:00:00.000Z')
const PAST = new Date('2026-09-01T00:00:00.000Z').toISOString()
const FUTURE = new Date('2026-10-01T00:00:00.000Z').toISOString()

function row(over: Partial<ManualRequestTtlRow> = {}): ManualRequestTtlRow {
  return { status: 'pending', expires_at: FUTURE, payment_reported_at: null, ...over }
}

describe('isManualRequestOpen', () => {
  it('is open when payment_received, regardless of a past expires_at', () => {
    expect(isManualRequestOpen(row({ status: 'payment_received', expires_at: PAST }), NOW)).toBe(true)
  })

  it('is open when payment_reported_at is set even though expires_at has passed', () => {
    // The rule that stops the sweep cancelling a request with money claimed
    // against it — a student who reported must never lose the queue position.
    expect(
      isManualRequestOpen(row({ status: 'pending', expires_at: PAST, payment_reported_at: '2026-09-10T00:00:00.000Z' }), NOW),
    ).toBe(true)
  })

  it('is open when expires_at is null (rows predating the column)', () => {
    expect(isManualRequestOpen(row({ expires_at: null }), NOW)).toBe(true)
  })

  it('is open when expires_at is in the future', () => {
    expect(isManualRequestOpen(row({ expires_at: FUTURE }), NOW)).toBe(true)
  })

  it.each(['completed', 'cancelled'])('is NOT open when the status is terminal (%s)', status => {
    expect(isManualRequestOpen(row({ status, expires_at: FUTURE }), NOW)).toBe(false)
    expect(isManualRequestOpen(row({ status, expires_at: null }), NOW)).toBe(false)
  })

  it('is NOT open when expires_at has passed with no report', () => {
    expect(isManualRequestOpen(row({ status: 'pending', expires_at: PAST, payment_reported_at: null }), NOW)).toBe(false)
  })
})

describe('isManualRequestExpirable', () => {
  it('is expirable only for pending/contacted with a passed expires_at and no report', () => {
    expect(isManualRequestExpirable(row({ status: 'pending', expires_at: PAST }), NOW)).toBe(true)
    expect(isManualRequestExpirable(row({ status: 'contacted', expires_at: PAST }), NOW)).toBe(true)
  })

  it('is NOT expirable for payment_received', () => {
    expect(isManualRequestExpirable(row({ status: 'payment_received', expires_at: PAST }), NOW)).toBe(false)
  })

  it('is NOT expirable for a reported row', () => {
    expect(
      isManualRequestExpirable(
        row({ status: 'pending', expires_at: PAST, payment_reported_at: '2026-09-10T00:00:00.000Z' }),
        NOW,
      ),
    ).toBe(false)
  })

  it('is NOT expirable when expires_at is null', () => {
    expect(isManualRequestExpirable(row({ status: 'pending', expires_at: null }), NOW)).toBe(false)
  })

  it('is NOT expirable for a future expiry', () => {
    expect(isManualRequestExpirable(row({ status: 'pending', expires_at: FUTURE }), NOW)).toBe(false)
  })
})

describe('open vs expirable are mutually exclusive', () => {
  const statuses = ['pending', 'contacted', 'payment_received', 'completed', 'cancelled']
  const expiries: (string | null)[] = [PAST, FUTURE, null]
  const reported: (string | null)[] = [null, '2026-09-10T00:00:00.000Z']

  for (const status of statuses) {
    for (const expires_at of expiries) {
      for (const payment_reported_at of reported) {
        it(`status=${status} expires_at=${expires_at} reported=${payment_reported_at} — never both open and expirable`, () => {
          const r = row({ status, expires_at, payment_reported_at })
          const open = isManualRequestOpen(r, NOW)
          const expirable = isManualRequestExpirable(r, NOW)
          expect(open && expirable).toBe(false)
        })
      }
    }
  }
})

describe('manualRequestExpiresAt', () => {
  it('returns created + MANUAL_REQUEST_TTL_DAYS', () => {
    const created = new Date('2026-09-20T00:00:00.000Z')
    const expected = new Date(created.getTime() + MANUAL_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    expect(manualRequestExpiresAt(created)).toBe(expected)
  })
})

describe('manualReminderDueAt', () => {
  it('returns expiry - MANUAL_REQUEST_REMINDER_LEAD_DAYS', () => {
    const expiresAt = '2026-10-04T00:00:00.000Z'
    const expected = new Date(new Date(expiresAt).getTime() - MANUAL_REQUEST_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000)
    expect(manualReminderDueAt(expiresAt).getTime()).toBe(expected.getTime())
  })
})

describe('status set sanity', () => {
  it('payment_received is open-only, never in the expirable set', () => {
    expect(OPEN_MANUAL_REQUEST_STATUSES).toContain('payment_received')
    expect(EXPIRABLE_MANUAL_REQUEST_STATUSES as readonly string[]).not.toContain('payment_received')
  })
})
