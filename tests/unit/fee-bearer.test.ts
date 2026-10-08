import { describe, it, expect } from 'vitest'
import {
  canPassFeeToStudent,
  chargedAmount,
  effectiveFeeBearer,
  feeBreakdown,
  normalizeFeeBearer,
} from '@/lib/payments/fee-bearer'
import { computeRevenueTotals } from '@/lib/payments/revenue-share'
import { netOfRefunds, roundMoney } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'

/**
 * Issue #927 — the school can pass the platform fee on to the buyer.
 *
 * The charge is grossed up so the platform's usual percentage OF WHAT THE BUYER
 * PAYS leaves the school exactly the listed price. That keeps every existing
 * money sum (school_percentage_snapshot × amount, netOfRefunds) correct for both
 * bearers, which is what the reconciliation tests below pin.
 */

describe('normalizeFeeBearer', () => {
  it('reads anything unknown as the historical default', () => {
    expect(normalizeFeeBearer('student')).toBe('student')
    expect(normalizeFeeBearer('school')).toBe('school')
    expect(normalizeFeeBearer(null)).toBe('school')
    expect(normalizeFeeBearer('buyer')).toBe('school')
  })
})

describe('which providers can pass the fee to the student', () => {
  it('never on a rail that takes no platform fee', () => {
    for (const provider of Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]) {
      if (!PROVIDER_CAPABILITIES[provider].bearsPlatformFee) {
        expect(canPassFeeToStudent(provider)).toBe(false)
      }
    }
    expect(canPassFeeToStudent('manual')).toBe(false)
    expect(canPassFeeToStudent('binance_personal')).toBe(false)
  })

  it('not on Lemon Squeezy, whose variant price is charged regardless of our amount', () => {
    expect(canPassFeeToStudent('lemonsqueezy')).toBe(false)
  })

  it('on rails that charge our amount and take a fee', () => {
    expect(canPassFeeToStudent('stripe')).toBe(true)
    expect(canPassFeeToStudent('paypal')).toBe(true)
    expect(canPassFeeToStudent('binance')).toBe(true)
    expect(canPassFeeToStudent('solana')).toBe(true)
  })

  it('unknown or missing provider falls back to school', () => {
    expect(canPassFeeToStudent(null)).toBe(false)
    expect(canPassFeeToStudent('nope')).toBe(false)
    expect(effectiveFeeBearer('student', 'manual')).toBe('school')
    expect(effectiveFeeBearer('student', 'paypal')).toBe('student')
    expect(effectiveFeeBearer('school', 'paypal')).toBe('school')
  })
})

describe('chargedAmount', () => {
  it('school bears → the listed price, untouched', () => {
    expect(chargedAmount(100, 20, 'school')).toBe(100)
    expect(chargedAmount(49.99, 20, 'school')).toBe(49.99)
  })

  it('student bears → grossed up so 80% of the charge is the price', () => {
    expect(chargedAmount(100, 20, 'student')).toBe(125)
    expect(chargedAmount(100, 10, 'student')).toBe(111.12) // 111.111… rounded UP
  })

  it('a 0% fee plan, a free product or an absurd split charges the price', () => {
    expect(chargedAmount(100, 0, 'student')).toBe(100)
    expect(chargedAmount(0, 20, 'student')).toBe(0)
    expect(chargedAmount(100, 100, 'student')).toBe(100)
    expect(chargedAmount(100, -5, 'student')).toBe(100)
  })

  it('zero-decimal currencies round up to whole units', () => {
    expect(chargedAmount(10000, 20, 'student', 'clp')).toBe(12500)
    expect(chargedAmount(9999, 10, 'student', 'clp')).toBe(11110)
  })

  it('the school never receives a cent less than the price, across a sweep', () => {
    for (const pct of [2, 5, 10, 15, 20, 33]) {
      for (let cents = 1; cents <= 20000; cents += 37) {
        const price = cents / 100
        const charged = chargedAmount(price, pct, 'student')
        const schoolShare = roundMoney((charged * (100 - pct)) / 100)
        expect(schoolShare).toBeGreaterThanOrEqual(price)
        // …and never more than a cent over (no silent overcharge).
        expect(schoolShare - price).toBeLessThanOrEqual(0.01 + 1e-9)
      }
    }
  })
})

describe('feeBreakdown (the product editor preview)', () => {
  it('school bears: fee comes out of the price', () => {
    expect(feeBreakdown(100, 20, 'school')).toEqual({
      price: 100,
      platformFee: 20,
      customerPays: 100,
      schoolReceives: 80,
    })
  })

  it('student bears: the school receives the price', () => {
    expect(feeBreakdown(100, 20, 'student')).toEqual({
      price: 100,
      platformFee: 25,
      customerPays: 125,
      schoolReceives: 100,
    })
  })

  it('platformFee + schoolReceives always equals customerPays', () => {
    for (const bearer of ['school', 'student'] as const) {
      const b = feeBreakdown(49.99, 20, bearer)
      expect(roundMoney(b.platformFee + b.schoolReceives)).toBe(b.customerPays)
    }
  })
})

describe('reconciliation with the existing money sums', () => {
  it('computeRevenueTotals reports the listed price as the school net for a student-bears sale', () => {
    const price = 49.99
    const charged = chargedAmount(price, 20, 'student')
    const totals = computeRevenueTotals(
      [{ amount: charged, paymentProvider: 'paypal', schoolPercentageSnapshot: 80 }],
      80,
    )
    expect(totals.grossRevenue).toBe(charged)
    expect(totals.netRevenue).toBe(feeBreakdown(price, 20, 'student').schoolReceives)
    expect(totals.netRevenue).toBeGreaterThanOrEqual(price)
  })

  it('a partial refund still nets through netOfRefunds for a grossed-up sale', () => {
    const charged = chargedAmount(100, 20, 'student') // 125
    const totals = computeRevenueTotals(
      [{ amount: charged, refundedAmount: 25, paymentProvider: 'stripe', schoolPercentageSnapshot: 80 }],
      80,
    )
    expect(netOfRefunds(charged, 25)).toBe(100)
    expect(totals.grossRevenue).toBe(100)
    expect(totals.netRevenue).toBe(80)
    expect(totals.platformFees).toBe(20)
  })
})
