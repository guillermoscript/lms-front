/**
 * The school-facing side of the same split `lib/payments/payouts-owed.ts`
 * computes for the platform (issue #547).
 *
 * Before this module the two disagreed by the entire platform fee. The school
 * screens decided whether a fee applied by reconstructing the labels
 * `'stripe'` / `'manual'` from `transactions.stripe_payment_intent_id` and
 * testing them against `revenue_splits.applies_to_providers`, which defaults to
 * `ARRAY['stripe']`. A PayPal / Lemon Squeezy / Binance sale is neither label,
 * so it bore a 0% fee and the school's "net revenue" showed 100% of it — while
 * `getPayoutsOwed()` applied the tenant's 80% split to those same rows and the
 * platform kept the other 20%. Two shipped, authoritative-looking screens, one
 * platform fee apart, on every platform-settled sale.
 *
 * The fix is to compute both sides from the same two inputs:
 *
 *   - **Whether the provider takes a fee at all** — `bearsPlatformFee` in
 *     `types.ts`, a property of the provider (does a platform account sit in the
 *     money path?), not of the tenant. `manual` and `binance_personal` pay the
 *     school's own account directly and are the only two that bear none.
 *
 *   - **The rate** — the transaction's own `school_percentage_snapshot`, frozen
 *     at insert by the #512 backstop trigger, falling back to the tenant's
 *     current split for pre-#496 rows. This is exactly what
 *     `computeOwedBalances` reads, so a plan change re-prices neither view
 *     (#496) and the two reconcile by construction.
 *
 * Money is rounded per transaction with `roundMoney`, the same half-up-to-cents
 * rule the payout side uses, so the figures agree to the cent rather than to
 * within float noise.
 */

import { PROVIDER_CAPABILITIES, type PaymentProvider } from './types'
import { netOfRefunds, roundMoney } from './payouts-owed'

/** Providers through which the platform actually takes its cut. */
export const FEE_BEARING_PROVIDERS = new Set<string>(
  (Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]).filter(
    (provider) => PROVIDER_CAPABILITIES[provider].bearsPlatformFee,
  ),
)

export interface RevenueTxn {
  /** transactions.amount, major units. */
  amount: number
  /** transactions.refunded_amount — the slice given back (issue #547). */
  refundedAmount?: number | null
  /** transactions.payment_provider. Null on legacy rows; see `resolveProvider`. */
  paymentProvider?: string | null
  /** transactions.stripe_payment_intent_id — the only way to identify a legacy Stripe row. */
  stripePaymentIntentId?: string | null
  /** transactions.school_percentage_snapshot (0–100), or null for pre-#496 rows. */
  schoolPercentageSnapshot?: number | null
}

/**
 * A row predating `payment_provider` carries a Stripe payment-intent id and
 * nothing else; anything older with neither is an offline/manual sale. Same
 * coalesce `get_platform_revenue` does in SQL.
 */
export function resolveProvider(txn: RevenueTxn): string {
  if (txn.paymentProvider) return txn.paymentProvider
  return txn.stripePaymentIntentId ? 'stripe' : 'manual'
}

export function bearsPlatformFee(txn: RevenueTxn): boolean {
  return FEE_BEARING_PROVIDERS.has(resolveProvider(txn))
}

export interface RevenueTotals {
  /** Sum of (amount − refunded) over every transaction, fee-bearing or not. */
  grossRevenue: number
  /** The platform's cut, taken only on fee-bearing providers. */
  platformFees: number
  /** grossRevenue − platformFees: what the school keeps or is owed. */
  netRevenue: number
}

/**
 * Split a set of successful transactions into what the school keeps and what
 * the platform takes.
 *
 * @param fallbackSchoolPercentage the tenant's CURRENT `revenue_splits.school_percentage`,
 *   used only for rows with no snapshot.
 */
export function computeRevenueTotals(
  txns: RevenueTxn[],
  fallbackSchoolPercentage: number,
): RevenueTotals {
  let grossRevenue = 0
  let platformFees = 0

  for (const txn of txns) {
    const kept = netOfRefunds(Number(txn.amount ?? 0), txn.refundedAmount)
    grossRevenue += kept
    if (!bearsPlatformFee(txn)) continue
    const schoolPercentage = txn.schoolPercentageSnapshot ?? fallbackSchoolPercentage
    // Derived as (kept − school's share) rather than as kept × platform%, so the
    // school's number here is bit-for-bit the one `computeOwedBalances` reports
    // and the two views can never drift by a rounding step.
    platformFees += kept - roundMoney((kept * schoolPercentage) / 100)
  }

  grossRevenue = roundMoney(grossRevenue)
  platformFees = roundMoney(platformFees)
  return { grossRevenue, platformFees, netRevenue: roundMoney(grossRevenue - platformFees) }
}

/** The split fallback used when a tenant has no `revenue_splits` row at all. */
export const DEFAULT_PLATFORM_PERCENTAGE = 20

/**
 * The platform's cut of a sale, as a percentage.
 *
 * Exists because the obvious spelling is wrong in a way that costs a school
 * real money: `split?.platform_percentage || 20` reads a legitimate **0%** as
 * missing, because PostgREST returns `numeric` as a JSON number and `0` is
 * falsy. Business and Enterprise are 0%-fee plans, so the schools paying us the
 * most were the ones charged a 20% platform fee on every student sale (#605).
 *
 * The fallback applies only when there is genuinely no split on file. Note that
 * it is a flat 20% rather than the tenant's plan fee — a tenant whose
 * `revenue_splits` row was never written is misconfigured either way, and every
 * writer of that table (`downgradeTenantToFree`, `confirmManualPayment`,
 * `dispatchPlatformBillingEvent`) sets it from the plan.
 */
export function resolvePlatformPercentage(
  split: { platform_percentage?: number | string | null } | null | undefined,
): number {
  const raw = split?.platform_percentage
  if (raw === null || raw === undefined || raw === '') return DEFAULT_PLATFORM_PERCENTAGE
  const value = Number(raw)
  return Number.isFinite(value) ? value : DEFAULT_PLATFORM_PERCENTAGE
}
