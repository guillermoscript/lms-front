import { describe, it, expect } from 'vitest'
import { dueNoticeWindow, isExpired, daysUntil } from '@/lib/billing/comped-expiry'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-20T12:00:00.000Z')
const until = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()
const due = (days: number, sentMap = {}) => dueNoticeWindow({ compedUntil: until(days), sentMap, now: NOW })

describe('dueNoticeWindow', () => {
  it('sends nothing outside the widest window or once expired', () => {
    expect(due(31)).toBeNull()
    expect(due(0)).toBeNull()
    expect(due(-1)).toBeNull()
    expect(dueNoticeWindow({ compedUntil: null, sentMap: {}, now: NOW })).toBeNull()
  })

  it('reaches each window exactly on its day', () => {
    expect(due(30)?.window).toBe(30)
    expect(due(14)?.window).toBe(14)
    expect(due(3)?.window).toBe(3)
    expect(due(1)?.window).toBe(3)
  })

  it('rounds partial days up (14.5 days left has not reached 14)', () => {
    expect(due(14.5)?.window).toBe(30)
    expect(due(13.5)?.window).toBe(14)
  })

  it('a school converted 10 days out gets ONE notice, covering the larger window', () => {
    const d = due(10)!
    expect(d.window).toBe(14)
    expect(d.covers).toEqual([14, 30])
  })

  it('does not resend a sent window and never sends a stale larger one', () => {
    expect(due(20, { '30': 'x' })).toBeNull()
    // 30 was skipped but 14 is sent: at day 12 the 30-day notice would be stale.
    expect(due(12, { '14': 'x' })).toBeNull()
    expect(due(12, { '30': 'x' })?.window).toBe(14)
    expect(due(2, { '30': 'x', '14': 'x' })?.window).toBe(3)
    expect(due(2, { '30': 'x', '14': 'x', '3': 'x' })).toBeNull()
  })
})

describe('isExpired / daysUntil', () => {
  it('expiry boundary is inclusive of now', () => {
    expect(isExpired(NOW.toISOString(), NOW)).toBe(true)
    expect(isExpired(until(0.001), NOW)).toBe(false)
    expect(isExpired(until(-1), NOW)).toBe(true)
    expect(isExpired(null, NOW)).toBe(false)
  })
  it('daysUntil rounds up and floors at 0', () => {
    expect(daysUntil(until(0.2), NOW)).toBe(1)
    expect(daysUntil(until(-3), NOW)).toBe(0)
    expect(daysUntil('garbage', NOW)).toBeNull()
  })
})
