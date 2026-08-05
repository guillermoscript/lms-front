import { describe, expect, it } from 'vitest'
import {
  findPartiallyPricedPlans,
  findUnpurchasablePlans,
  summarizePlanPurchasability,
  type PlatformPlanInput,
  type PlatformPlanPriceInput,
} from '@/lib/billing/plan-prices'

/**
 * #602's regression guard. The bug it protects against is not subtle logic —
 * it is a table nobody wrote, which every existing suite missed because the
 * fixtures hardcoded price ids the database never held. So these tests assert
 * on the *absence* of configuration, which is the state a real environment was
 * actually in.
 */

function plan(overrides: Partial<PlatformPlanInput> = {}): PlatformPlanInput {
  return {
    planId: 'plan-pro',
    slug: 'pro',
    name: 'Pro',
    priceMonthly: 29,
    priceYearly: 290,
    isActive: true,
    ...overrides,
  }
}

function price(overrides: Partial<PlatformPlanPriceInput> = {}): PlatformPlanPriceInput {
  return {
    priceId: 'price-row-1',
    planId: 'plan-pro',
    paymentProvider: 'stripe',
    interval: 'monthly',
    providerPriceId: 'price_123',
    currency: 'usd',
    amount: 29,
    isActive: true,
    ...overrides,
  }
}

describe('findUnpurchasablePlans', () => {
  it('flags an active paid plan with no price rows at all', () => {
    const result = findUnpurchasablePlans([plan()], [])

    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('pro')
    expect(result[0].isPurchasable).toBe(false)
  })

  it('flags a plan whose only price row is inactive', () => {
    // The exact half-configured state a super admin lands in after toggling a
    // price off: the row still exists, so a naive `count > 0` check would call
    // the plan healthy while checkout — which filters on is_active — 400s.
    const result = findUnpurchasablePlans([plan()], [price({ isActive: false })])

    expect(result.map((p) => p.slug)).toEqual(['pro'])
  })

  it('stays silent once an active price exists', () => {
    expect(findUnpurchasablePlans([plan()], [price()])).toEqual([])
  })

  it('never flags the free plan', () => {
    const free = plan({ planId: 'plan-free', slug: 'free', name: 'Free', priceMonthly: 0, priceYearly: 0 })

    expect(findUnpurchasablePlans([free], [])).toEqual([])
  })

  it('never flags an inactive plan — nobody can reach it', () => {
    expect(findUnpurchasablePlans([plan({ isActive: false })], [])).toEqual([])
  })

  it('flags a yearly-only plan with no prices', () => {
    // priceMonthly is 0 here, so a check keyed literally on `price_monthly > 0`
    // would let this one through even though its pricing page is a dead button.
    const yearlyOnly = plan({ priceMonthly: 0, priceYearly: 290 })

    expect(findUnpurchasablePlans([yearlyOnly], []).map((p) => p.slug)).toEqual(['pro'])
  })

  it('reports each misconfigured plan separately', () => {
    const starter = plan({ planId: 'plan-starter', slug: 'starter', name: 'Starter', priceMonthly: 9, priceYearly: 90 })
    const business = plan({ planId: 'plan-biz', slug: 'business', name: 'Business', priceMonthly: 79, priceYearly: 790 })

    const result = findUnpurchasablePlans(
      [plan(), starter, business],
      [price({ planId: 'plan-starter' })],
    )

    expect(result.map((p) => p.slug).sort()).toEqual(['business', 'pro'])
  })
})

describe('findPartiallyPricedPlans', () => {
  it('flags a plan priced monthly but not yearly', () => {
    const result = findPartiallyPricedPlans([plan()], [price({ interval: 'monthly' })])

    expect(result).toHaveLength(1)
    expect(result[0].missingIntervals).toEqual(['yearly'])
  })

  it('does not flag a plan priced on both intervals', () => {
    const result = findPartiallyPricedPlans(
      [plan()],
      [price({ interval: 'monthly' }), price({ priceId: 'price-row-2', interval: 'yearly' })],
    )

    expect(result).toEqual([])
  })

  it('does not double-report a plan that has no prices at all', () => {
    // That plan belongs to findUnpurchasablePlans; listing it in both would
    // show the same outage twice on the dashboard, once softened to amber.
    expect(findPartiallyPricedPlans([plan()], [])).toEqual([])
  })

  it('counts coverage across providers, not per provider', () => {
    // Stripe monthly + Lemon Squeezy yearly leaves no interval uncovered, even
    // though neither provider covers both on its own.
    const result = findPartiallyPricedPlans(
      [plan()],
      [
        price({ interval: 'monthly', paymentProvider: 'stripe' }),
        price({ priceId: 'price-row-2', interval: 'yearly', paymentProvider: 'lemonsqueezy' }),
      ],
    )

    expect(result).toEqual([])
  })
})

describe('summarizePlanPurchasability', () => {
  it('groups intervals under each provider, monthly first', () => {
    const [summary] = summarizePlanPurchasability(
      [plan()],
      [
        price({ priceId: 'a', interval: 'yearly', paymentProvider: 'stripe' }),
        price({ priceId: 'b', interval: 'monthly', paymentProvider: 'stripe' }),
        price({ priceId: 'c', interval: 'monthly', paymentProvider: 'lemonsqueezy' }),
      ],
    )

    expect(summary.isPurchasable).toBe(true)
    expect(summary.providers).toEqual([
      { provider: 'lemonsqueezy', intervals: ['monthly'] },
      { provider: 'stripe', intervals: ['monthly', 'yearly'] },
    ])
  })

  it('ignores inactive rows when listing providers', () => {
    const [summary] = summarizePlanPurchasability(
      [plan()],
      [price({ paymentProvider: 'stripe' }), price({ priceId: 'b', paymentProvider: 'paypal', isActive: false })],
    )

    expect(summary.providers.map((p) => p.provider)).toEqual(['stripe'])
  })

  it('does not leak one plan’s prices onto another', () => {
    const starter = plan({ planId: 'plan-starter', slug: 'starter', name: 'Starter' })
    const summaries = summarizePlanPurchasability([plan(), starter], [price({ planId: 'plan-pro' })])

    expect(summaries.find((s) => s.slug === 'pro')?.isPurchasable).toBe(true)
    expect(summaries.find((s) => s.slug === 'starter')?.isPurchasable).toBe(false)
  })

  it('marks the free plan as unpaid rather than unpurchasable', () => {
    const [summary] = summarizePlanPurchasability(
      [plan({ slug: 'free', priceMonthly: 0, priceYearly: 0 })],
      [],
    )

    expect(summary.isPaid).toBe(false)
    expect(summary.missingIntervals).toEqual([])
  })
})
