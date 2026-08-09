/**
 * Whether a platform plan can actually be bought, and through what.
 *
 * #602: `platform_plans.stripe_price_id_monthly/_yearly` were read by three
 * call sites and written by none, so every card upgrade died on
 * `"Stripe price not configured for this plan"`. #601 replaced those columns
 * with `platform_plan_prices` — one row per (plan, provider, interval) — but a
 * table nobody writes fails exactly the same way. This module is the check
 * that makes the failure visible before a school hits it: an active plan that
 * charges money and has no active price row is misconfigured, full stop.
 *
 * Deliberately *not* folded into `lib/billing/billing-health.ts`. That module
 * computes `AtRiskTenant[]` — a per-tenant risk view — and a plan with no price
 * is not tenant-shaped: it affects every school at once and none of them
 * individually. Forcing it into `AtRiskTenant` would mean inventing a tenant id
 * for a row that has none.
 *
 * Pure/no I/O, like `billing-health.ts` and `lib/payments/payouts-owed.ts`:
 * the caller does the fetching, so the union logic is unit-testable without a
 * database. That matters here more than usual — the bug this guards against
 * survived every prior pass precisely because the unit tests pinned the
 * modules and nothing tested the callers (#540).
 */

import {
  evaluatePlatformCheckoutAvailability,
  platformCheckoutReasonLabel,
  type PlatformCheckoutUnavailableReason,
  type PlatformProviderRuntimeStatus,
} from '@/lib/billing/platform-checkout-availability'

export { platformCheckoutReasonLabel }

export type PlanPriceInterval = 'monthly' | 'yearly'

export const PLAN_PRICE_INTERVALS: readonly PlanPriceInterval[] = ['monthly', 'yearly']

/**
 * Every provider the `platform_plan_prices.payment_provider` CHECK accepts —
 * kept identical to the migration and to `PaymentProvider` in
 * `lib/payments/types.ts`, so a 9th provider stays a one-line edit in each.
 * Writes validate against this; it is the schema's truth, not a policy.
 */
export const PLAN_PRICE_PROVIDERS = [
  'stripe',
  'paypal',
  'binance',
  'binance_personal',
  'manual',
  'lemonsqueezy',
  'solana',
  'solana_subs',
] as const

export type PlanPriceProvider = (typeof PLAN_PRICE_PROVIDERS)[number]

/**
 * The subset offered in the super-admin UI. Platform billing is us selling a
 * recurring SaaS subscription to a school, which is a different problem from a
 * school selling a course to a student, and only some rails fit it (#600):
 * Stripe for native subscriptions and dunning, Lemon Squeezy because
 * `isMerchantOfRecord` makes it the legal seller and it remits VAT for us, and
 * PayPal once #479 has run it against real credentials.
 *
 * Binance Pay and Solana joined in #610. Neither renews itself — each payment
 * buys one period and the expiry cron lapses it — but "no native recurring
 * billing" is a weaker objection than it looks for the schools this platform
 * sells to: a LATAM creator who holds USDT and no card could not pay us at all
 * before, and a rail with no proration is still better than a rail with no
 * payment. `solana_subs` stays out despite auto-pulling, because cancelling one
 * needs the payer's own wallet signature — a subscription a school cannot stop
 * from our billing page is not one to sell it.
 *
 * `manual` settles through `platform_payment_requests`, which carries its own
 * amount snapshot and needs no price id.
 *
 * A narrower list than the CHECK on purpose: the action still accepts anything
 * the database accepts, so a later issue can write a provider this list has not
 * caught up with yet.
 */
export const PLATFORM_BILLING_UI_PROVIDERS: readonly PlanPriceProvider[] = [
  'stripe',
  'lemonsqueezy',
  'paypal',
  'binance',
  'solana',
]

/** Values of the `currency_type` Postgres enum, which `currency` is typed as. */
export const PLAN_PRICE_CURRENCIES = [
  'usd',
  'eur',
  'mxn',
  'cop',
  'clp',
  'pen',
  'ars',
  'brl',
] as const

export type PlanPriceCurrency = (typeof PLAN_PRICE_CURRENCIES)[number]

export const PROVIDER_LABELS: Record<PlanPriceProvider, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  binance: 'Binance Pay',
  binance_personal: 'Binance (personal)',
  manual: 'Manual transfer',
  lemonsqueezy: 'Lemon Squeezy',
  solana: 'Solana',
  solana_subs: 'Solana (subscription)',
}

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider as PlanPriceProvider] ?? provider
}

/** A `platform_plans` row, only the fields purchasability depends on. */
export interface PlatformPlanInput {
  planId: string
  slug: string
  name: string
  priceMonthly: number
  priceYearly: number
  isActive: boolean
}

/** A `platform_plan_prices` row. */
export interface PlatformPlanPriceInput {
  priceId: string
  planId: string
  paymentProvider: string
  interval: string
  /** NULL on catalog-less rails (Binance Pay, Solana) — see the migration. */
  providerPriceId: string | null
  currency: string
  amount: number | null
  isActive: boolean
}

export interface ProviderCoverage {
  provider: string
  /** Intervals this provider has an *active* price row for, monthly first. */
  intervals: PlanPriceInterval[]
}

export interface ProviderDiagnostic {
  provider: string
  availableIntervals: PlanPriceInterval[]
  unavailable: Array<{ interval: PlanPriceInterval; reason: PlatformCheckoutUnavailableReason }>
}

export interface PlanPurchasability {
  planId: string
  slug: string
  name: string
  isActive: boolean
  /** True when the plan charges for at least one interval. */
  isPaid: boolean
  /** True when at least one active price row can execute automated checkout. */
  isPurchasable: boolean
  /** Providers with at least one active price row. */
  providers: ProviderCoverage[]
  /** Providers with at least one executable automated checkout method. */
  automatedProviders: ProviderCoverage[]
  /** Per-provider reason for every charged interval that is not executable. */
  providerDiagnostics: ProviderDiagnostic[]
  /** Manual transfer is a separate fallback and never counts as automation. */
  manualAvailable: boolean
  /**
   * Intervals the plan charges for but no provider can execute checkout on.
   * A plan with a monthly *and* a yearly price but only a monthly executable method is
   * purchasable, yet half its pricing page is a dead button — that is a
   * weaker problem than "no price at all", so it is reported separately rather
   * than collapsed into `isPurchasable`.
   */
  missingIntervals: PlanPriceInterval[]
}

function chargedIntervals(plan: PlatformPlanInput): PlanPriceInterval[] {
  const intervals: PlanPriceInterval[] = []
  if (plan.priceMonthly > 0) intervals.push('monthly')
  if (plan.priceYearly > 0) intervals.push('yearly')
  return intervals
}

/**
 * Joins plans to their price rows and reports, per plan, what it can be bought
 * through. Inactive price rows are ignored everywhere — a row toggled off is
 * exactly as unbuyable as a row that does not exist, and
 * `app/api/billing/checkout/route.ts` filters on `is_active` too.
 */
export function summarizePlanPurchasability(
  plans: PlatformPlanInput[],
  prices: PlatformPlanPriceInput[],
  options: {
    providerStatuses?: Record<string, PlatformProviderRuntimeStatus>
    expectedCurrency?: string
  } = {},
): PlanPurchasability[] {
  const activePricesByPlan = new Map<string, PlatformPlanPriceInput[]>()
  for (const price of prices) {
    if (!price.isActive) continue
    const existing = activePricesByPlan.get(price.planId)
    if (existing) existing.push(price)
    else activePricesByPlan.set(price.planId, [price])
  }

  return plans.map((plan) => {
    const active = activePricesByPlan.get(plan.planId) ?? []

    const intervalsByProvider = new Map<string, Set<string>>()
    for (const price of active) {
      const existing = intervalsByProvider.get(price.paymentProvider)
      if (existing) existing.add(price.interval)
      else intervalsByProvider.set(price.paymentProvider, new Set([price.interval]))
    }

    const providers: ProviderCoverage[] = [...intervalsByProvider.entries()]
      .map(([provider, intervals]) => ({
        provider,
        intervals: PLAN_PRICE_INTERVALS.filter((i) => intervals.has(i)),
      }))
      .sort((a, b) => a.provider.localeCompare(b.provider))

    const charged = chargedIntervals(plan)

    const providerDiagnostics: ProviderDiagnostic[] = [...intervalsByProvider.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((provider) => {
        const rows = active.filter((price) => price.paymentProvider === provider)
        const runtime = options.providerStatuses?.[provider]
        const availableIntervals: PlanPriceInterval[] = []
        const unavailable: ProviderDiagnostic['unavailable'] = []

        for (const interval of charged) {
          const exact = rows.find((price) => price.interval === interval)
          const fallback = exact ?? rows[0] ?? null
          const availability = evaluatePlatformCheckoutAvailability({
            provider,
            interval,
            price: fallback
              ? {
                  interval: fallback.interval,
                  currency: fallback.currency,
                  providerPriceId: fallback.providerPriceId,
                  amount: fallback.amount,
                }
              : null,
            expectedCurrency: options.expectedCurrency,
            fallbackAmount: interval === 'yearly' ? plan.priceYearly : plan.priceMonthly,
            runtime,
          })

          if (availability.available && exact) availableIntervals.push(interval)
          else unavailable.push({ interval, reason: availability.reason })
        }

        return { provider, availableIntervals, unavailable }
      })

    const automatedProviders = providers.filter((provider) =>
      providerDiagnostics.some(
        (diagnostic) =>
          diagnostic.provider === provider.provider && diagnostic.availableIntervals.length > 0,
      ),
    )
    const covered = new Set(
      providerDiagnostics.flatMap((diagnostic) => diagnostic.availableIntervals),
    )

    return {
      planId: plan.planId,
      slug: plan.slug,
      name: plan.name,
      isActive: plan.isActive,
      isPaid: charged.length > 0,
      isPurchasable: automatedProviders.length > 0,
      providers,
      automatedProviders,
      providerDiagnostics,
      manualAvailable: charged.length > 0,
      missingIntervals: charged.filter((i) => !covered.has(i)),
    }
  })
}

/**
 * The check `/platform/billing-health` renders: active plans that charge money
 * and have no executable automated checkout method. These are advertised on the
 * pricing page at `$9/mo` and 400 on every card upgrade — the exact state #602
 * was filed for.
 *
 * The free plan is never listed: it charges nothing and is not meant to be
 * checked out (`checkout-session/route.ts` rejects it explicitly), so it has
 * no price to be missing. Neither is an inactive plan — nobody can reach it.
 */
export function findUnpurchasablePlans(
  plans: PlatformPlanInput[],
  prices: PlatformPlanPriceInput[],
  options: {
    providerStatuses?: Record<string, PlatformProviderRuntimeStatus>
    expectedCurrency?: string
  } = {},
): PlanPurchasability[] {
  return summarizePlanPurchasability(plans, prices, options).filter(
    (plan) => plan.isActive && plan.isPaid && !plan.isPurchasable,
  )
}

/**
 * The softer half: plans that *are* buyable, but not on every interval they
 * quote an executable price for. Reported apart from `findUnpurchasablePlans` so the hard
 * failure is never diluted by the partial one.
 */
export function findPartiallyPricedPlans(
  plans: PlatformPlanInput[],
  prices: PlatformPlanPriceInput[],
  options: {
    providerStatuses?: Record<string, PlatformProviderRuntimeStatus>
    expectedCurrency?: string
  } = {},
): PlanPurchasability[] {
  return summarizePlanPurchasability(plans, prices, options).filter(
    (plan) =>
      plan.isActive && plan.isPaid && plan.isPurchasable && plan.missingIntervals.length > 0,
  )
}
