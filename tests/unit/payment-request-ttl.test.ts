import { describe, it, expect } from 'vitest'
import {
  EXPIRABLE_REQUEST_STATUSES,
  OPEN_REQUEST_STATUSES,
  REQUEST_TTL_DAYS,
  isRequestOpen,
  requestExpiresAt,
} from '@/lib/billing/payment-request-ttl'

/**
 * Pins the TTL rules three call sites share (issue #546 §2): the two duplicate
 * guards in the billing actions, the cron's expiry sweep, and the cron's
 * downgrade pause. They disagreed before — the pause looked only at status, so
 * an unpaid renewal held the paid plan forever.
 */
const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-07-26T12:00:00.000Z')
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

describe('payment-request TTL', () => {
  it('stamps expiry TTL days out', () => {
    const ms = new Date(requestExpiresAt(NOW)).getTime() - NOW.getTime()
    expect(ms).toBe(REQUEST_TTL_DAYS * DAY)
  })

  it('counts every open status while the expiry is in the future', () => {
    for (const status of OPEN_REQUEST_STATUSES) {
      expect(isRequestOpen({ status, expires_at: at(1) }, NOW), status).toBe(true)
    }
  })

  it('stops counting the instant the expiry passes, before the cron sweeps it', () => {
    // Deliberate: tying "does it still count" to the sweep would hand the
    // downgrade-pause leak back during any cron outage.
    expect(isRequestOpen({ status: 'pending', expires_at: at(-0.001) }, NOW)).toBe(false)
  })

  it('never expires a request after money has been observed', () => {
    expect(EXPIRABLE_REQUEST_STATUSES).not.toContain('payment_received')
    expect(isRequestOpen({ status: 'payment_received', expires_at: at(-30) }, NOW)).toBe(true)
  })

  it('never counts a terminal status', () => {
    for (const status of ['confirmed', 'rejected', 'expired']) {
      expect(isRequestOpen({ status, expires_at: at(30) }, NOW), status).toBe(false)
    }
  })

  it('treats a NULL expiry as open so a legitimate request is never dropped', () => {
    expect(isRequestOpen({ status: 'pending', expires_at: null }, NOW)).toBe(true)
  })
})
