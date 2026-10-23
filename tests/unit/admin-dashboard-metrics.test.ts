import { describe, expect, it } from 'vitest'
import { computeDelta, foldRevenueWindows, isUnlimited } from '@/lib/admin/dashboard-metrics'

const now = new Date('2026-10-23T12:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

describe('computeDelta', () => {
  it('handles empty, new and signed changes', () => {
    expect(computeDelta(0, 0)).toEqual({ kind: 'none' })
    expect(computeDelta(5, 0)).toEqual({ kind: 'new' })
    expect(computeDelta(112, 100)).toEqual({ kind: 'change', percent: 12 })
    expect(computeDelta(50, 100)).toEqual({ kind: 'change', percent: -50 })
  })
})

describe('foldRevenueWindows', () => {
  it('splits current/previous windows net of refunds and ignores older rows', () => {
    const w = foldRevenueWindows(
      [
        { amount: 100, refunded_amount: 25, transaction_date: ago(2) },
        { amount: 40, refunded_amount: 0, transaction_date: ago(40) },
        { amount: 999, refunded_amount: 0, transaction_date: ago(90) },
      ],
      now,
    )
    expect(w.current).toBe(75)
    expect(w.previous).toBe(40)
    expect(w.series).toHaveLength(30)
    expect(w.series.reduce((s, p) => s + p.revenue, 0)).toBe(75)
  })
})

describe('isUnlimited', () => {
  it('treats -1, null and undefined as unlimited', () => {
    expect(isUnlimited(-1)).toBe(true)
    expect(isUnlimited(null)).toBe(true)
    expect(isUnlimited(undefined)).toBe(true)
    expect(isUnlimited(50)).toBe(false)
  })
})
