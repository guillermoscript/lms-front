import { describe, it, expect } from 'vitest'
import {
  computeRevenueTotals,
  bearsPlatformFee,
  FEE_BEARING_PROVIDERS,
  resolvePlatformPercentage,
  DEFAULT_PLATFORM_PERCENTAGE,
} from '@/lib/payments/revenue-share'
import { computeOwedBalances } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'

/**
 * Issue #547 §3 — the school-facing and platform-facing views of the same sale
 * must agree.
 *
 * They did not. `getRevenueOverview` labelled every transaction 'stripe' or
 * 'manual' by whether it had a `stripe_payment_intent_id`, then charged the
 * platform fee only if that label appeared in `revenue_splits.applies_to_providers`
 * — which defaults to ARRAY['stripe']. A PayPal sale was therefore 'manual',
 * bore 0%, and the school's net revenue showed 100% of it, while
 * `getPayoutsOwed` applied the tenant's 80% split to the same row and the
 * platform kept the rest.
 */

describe('which providers bear a platform fee', () => {
  it('charges a fee wherever a platform account is in the money path', () => {
    expect(bearsPlatformFee({ amount: 1, paymentProvider: 'stripe' })).toBe(true)
    expect(bearsPlatformFee({ amount: 1, paymentProvider: 'paypal' })).toBe(true)
    expect(bearsPlatformFee({ amount: 1, paymentProvider: 'lemonsqueezy' })).toBe(true)
    expect(bearsPlatformFee({ amount: 1, paymentProvider: 'binance' })).toBe(true)
    expect(bearsPlatformFee({ amount: 1, paymentProvider: 'solana' })).toBe(true)
    expect(bearsPlatformFee({ amount: 1, paymentProvider: 'solana_subs' })).toBe(true)
  })

  it('charges NO fee where the buyer pays the school directly', () => {
    // The platform never touches this money, so there is no mechanism by which
    // it could take a cut — charging one would understate the school's revenue.
    expect(bearsPlatformFee({ amount: 1, paymentProvider: 'manual' })).toBe(false)
    expect(bearsPlatformFee({ amount: 1, paymentProvider: 'binance_personal' })).toBe(false)
  })

  it('treats a legacy row with only a payment-intent id as Stripe, and one with neither as manual', () => {
    expect(bearsPlatformFee({ amount: 1, stripePaymentIntentId: 'pi_1' })).toBe(true)
    expect(bearsPlatformFee({ amount: 1 })).toBe(false)
  })

  it('every platform-settled provider bears a fee — the school is paid out of what the platform holds', () => {
    for (const provider of Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]) {
      if (PROVIDER_CAPABILITIES[provider].settlesToPlatformAccount) {
        expect(FEE_BEARING_PROVIDERS.has(provider)).toBe(true)
      }
    }
  })
})

describe('computeRevenueTotals', () => {
  it('#547: a PayPal sale bears the platform fee (it used to bear none)', () => {
    const totals = computeRevenueTotals(
      [{ amount: 100, paymentProvider: 'paypal', schoolPercentageSnapshot: 80 }],
      80,
    )
    expect(totals).toEqual({ grossRevenue: 100, platformFees: 20, netRevenue: 80 })
  })

  it('a manual sale bears none, so the school keeps all of it', () => {
    const totals = computeRevenueTotals(
      [{ amount: 100, paymentProvider: 'manual', schoolPercentageSnapshot: 80 }],
      80,
    )
    expect(totals).toEqual({ grossRevenue: 100, platformFees: 0, netRevenue: 100 })
  })

  it('uses the SNAPSHOTTED split, so a plan change does not re-price history (#496)', () => {
    const totals = computeRevenueTotals(
      [{ amount: 100, paymentProvider: 'paypal', schoolPercentageSnapshot: 90 }],
      50, // today's split — must not be applied to this old sale
    )
    expect(totals.platformFees).toBe(10)
  })

  it('falls back to the tenant\'s current split for a pre-#496 row with no snapshot', () => {
    const totals = computeRevenueTotals([{ amount: 100, paymentProvider: 'paypal' }], 70)
    expect(totals.platformFees).toBe(30)
  })

  it('#547: counts a partially refunded sale for what the platform kept', () => {
    const totals = computeRevenueTotals(
      [{ amount: 100, refundedAmount: 10, paymentProvider: 'paypal', schoolPercentageSnapshot: 80 }],
      80,
    )
    expect(totals).toEqual({ grossRevenue: 90, platformFees: 18, netRevenue: 72 })
  })
})

describe('#547: the school view and the platform view reconcile', () => {
  /**
   * The acceptance criterion, stated as a test: for the same tenant, currency
   * and period, what the school is told it earned equals what the platform is
   * told it owes. Both sides read the same snapshot at the same rounding.
   */
  const SALES = [
    { amount: 49.99, provider: 'paypal', snapshot: 80 },
    { amount: 100, provider: 'lemonsqueezy', snapshot: 80 },
    { amount: 33.33, provider: 'binance', snapshot: 80 },
  ]

  it('school-facing netRevenue === platform-facing grossOwed, to the cent', () => {
    const schoolSide = computeRevenueTotals(
      SALES.map((s) => ({ amount: s.amount, paymentProvider: s.provider, schoolPercentageSnapshot: s.snapshot })),
      80,
    )

    const platformSide = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      SALES.map((s) => ({
        tenantId: 't1',
        paymentProvider: s.provider,
        amount: s.amount,
        currency: 'usd',
        schoolPercentageSnapshot: s.snapshot,
        status: 'successful' as const,
        transactionDate: null,
      })),
      [],
    )
    const owed = platformSide[0].balances.find((b) => b.currency === 'usd')!

    expect(schoolSide.netRevenue).toBe(owed.grossOwed)
    expect(schoolSide.grossRevenue).toBe(owed.grossCollected)
    // And the fee is exactly the remainder — no money is unaccounted for.
    expect(schoolSide.platformFees).toBe(
      Math.round((owed.grossCollected - owed.grossOwed) * 100) / 100,
    )
  })

  it('still reconciles when one of the sales is partially refunded', () => {
    const schoolSide = computeRevenueTotals(
      [{ amount: 100, refundedAmount: 10, paymentProvider: 'paypal', schoolPercentageSnapshot: 80 }],
      80,
    )
    const platformSide = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, refundedAmount: 10, currency: 'usd', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: null }],
      [],
    )
    const owed = platformSide[0].balances.find((b) => b.currency === 'usd')!
    expect(schoolSide.netRevenue).toBe(owed.grossOwed)
    expect(schoolSide.grossRevenue).toBe(owed.grossCollected)
  })
})

describe('resolvePlatformPercentage (#605)', () => {
  it('keeps a configured 0% instead of falling back', () => {
    // The bug this replaces, in one line: `split?.platform_percentage || 20`.
    // Business and Enterprise are 0%-fee plans, PostgREST returns numeric as a
    // JSON number, and 0 is falsy — so the schools paying us the most were
    // charged 20% of every student sale as an application_fee_amount.
    expect(resolvePlatformPercentage({ platform_percentage: 0 })).toBe(0)
  })

  it('keeps 0 arriving as a numeric string', () => {
    expect(resolvePlatformPercentage({ platform_percentage: '0.00' })).toBe(0)
  })

  it('passes ordinary rates through', () => {
    expect(resolvePlatformPercentage({ platform_percentage: 5 })).toBe(5)
    expect(resolvePlatformPercentage({ platform_percentage: '2.50' })).toBe(2.5)
  })

  it('falls back only when there is genuinely no split on file', () => {
    expect(resolvePlatformPercentage(null)).toBe(DEFAULT_PLATFORM_PERCENTAGE)
    expect(resolvePlatformPercentage(undefined)).toBe(DEFAULT_PLATFORM_PERCENTAGE)
    expect(resolvePlatformPercentage({})).toBe(DEFAULT_PLATFORM_PERCENTAGE)
    expect(resolvePlatformPercentage({ platform_percentage: null })).toBe(DEFAULT_PLATFORM_PERCENTAGE)
  })

  it('falls back rather than producing NaN on a junk value', () => {
    // NaN would reach Stripe as application_fee_amount: NaN and fail the charge.
    expect(resolvePlatformPercentage({ platform_percentage: 'not-a-number' })).toBe(
      DEFAULT_PLATFORM_PERCENTAGE,
    )
  })

  it('produces a zero application fee for a 0%-fee school', () => {
    // The arithmetic the checkout route runs, at $49.99.
    const amount = 4999
    expect(Math.round((amount * resolvePlatformPercentage({ platform_percentage: 0 })) / 100)).toBe(0)
    // What it used to charge instead.
    expect(Math.round((amount * (0 || 20)) / 100)).toBe(1000)
  })
})
