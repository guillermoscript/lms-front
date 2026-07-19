import { describe, it, expect } from 'vitest'
import { classifyPlanChange } from '@/lib/billing/plan-change'

/**
 * Pins the pure plan-change classifier contract (issue #465): tier moves are
 * decided by sort_order; equal sort_order is an interval-only change decided
 * by amount, with equal amounts defaulting to 'upgrade'.
 */

describe('classifyPlanChange', () => {
  it('tier upgrade — target sort_order higher than current', () => {
    const result = classifyPlanChange({
      currentSortOrder: 1,
      currentAmount: 900,
      targetSortOrder: 2,
      targetAmount: 2900,
    })
    expect(result).toEqual({ requestType: 'upgrade', isIntervalOnly: false })
  })

  it('tier downgrade — target sort_order lower than current', () => {
    const result = classifyPlanChange({
      currentSortOrder: 2,
      currentAmount: 2900,
      targetSortOrder: 1,
      targetAmount: 900,
    })
    expect(result).toEqual({ requestType: 'downgrade', isIntervalOnly: false })
  })

  it('interval-only upgrade — equal sort_order, target amount higher (monthly → yearly)', () => {
    const result = classifyPlanChange({
      currentSortOrder: 2,
      currentAmount: 2900,
      targetSortOrder: 2,
      targetAmount: 29000,
    })
    expect(result).toEqual({ requestType: 'upgrade', isIntervalOnly: true })
  })

  it('interval-only downgrade — equal sort_order, target amount lower (yearly → monthly)', () => {
    const result = classifyPlanChange({
      currentSortOrder: 2,
      currentAmount: 29000,
      targetSortOrder: 2,
      targetAmount: 2900,
    })
    expect(result).toEqual({ requestType: 'downgrade', isIntervalOnly: true })
  })

  it('equal sort_order and equal amount defaults to upgrade', () => {
    const result = classifyPlanChange({
      currentSortOrder: 2,
      currentAmount: 2900,
      targetSortOrder: 2,
      targetAmount: 2900,
    })
    expect(result).toEqual({ requestType: 'upgrade', isIntervalOnly: true })
  })
})
