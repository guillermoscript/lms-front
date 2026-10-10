/**
 * Platform fee pay-now: what a school owes, which rails it can pay on and how
 * much a single payment may be (#929, design 2.4, D6). Server-only.
 *
 * The amount is ALWAYS derived from the ledger here, never taken from the
 * request: a school may ask to pay less than its balance (partial / daily
 * payments, carried default), never more, and never a figure we did not
 * compute. Automated rails are USD only (`expectedCurrency: 'usd'` of platform
 * billing); a balance in another currency is paid via the manual rail.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MONEY_EPSILON, roundMoney } from '@/lib/payments/payouts-owed'
import { computeFeeBalances, FEE_LEDGER_USD, type FeeBalance } from '@/lib/payments/platform-fee-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { loadFeeConfig, loadTenantFeeLedger } from '@/lib/billing/platform-fee-enforcement'

/** Rails a school can pay its fee balance on (capability-driven, never a slug list). */
export const FEE_PAY_NOW_PROVIDERS: readonly PaymentProvider[] = (
  Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]
).filter((p) => PROVIDER_CAPABILITIES[p].supportsPlatformFeePayNow === true)

/** Rails that settle without a human (webhook / on-chain): USD only. */
export function isAutomatedFeeRail(provider: PaymentProvider): boolean {
  return provider !== 'manual'
}

/** Automated rails (Stripe refuses under $0.50) share one floor; below it the school pays by transfer. */
export const MIN_AUTOMATED_FEE_PAYMENT_USD = 0.5

export type PayNowError =
  | 'unsupported_rail'
  | 'currency_not_supported_on_rail'
  | 'nothing_owed'
  | 'invalid_amount'
  | 'amount_below_minimum'

export interface PayNowQuote {
  provider: PaymentProvider
  /** Ledger bucket, upper-case ISO (USD for converted hyperinflation sales). */
  currency: string
  /** What will be charged / requested, major units, ≤ netOwed. */
  amount: number
  netOwed: number
  partial: boolean
}

/**
 * Decide the pay-now amount. Pure: `balances` comes from the ledger.
 * `requested` is a CAP (the school may pay less than it owes), never a price.
 */
export function quoteFeePayNow(input: {
  provider: string
  currency?: string | null
  requested?: unknown
  balances: readonly FeeBalance[]
}): { ok: true; value: PayNowQuote } | { ok: false; error: PayNowError } {
  const provider = input.provider as PaymentProvider
  if (!FEE_PAY_NOW_PROVIDERS.includes(provider)) return { ok: false, error: 'unsupported_rail' }

  const currency = (input.currency || FEE_LEDGER_USD).toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'invalid_amount' }
  if (isAutomatedFeeRail(provider) && currency !== FEE_LEDGER_USD) {
    return { ok: false, error: 'currency_not_supported_on_rail' }
  }

  const bucket = input.balances.find((b) => b.currency.toUpperCase() === currency)
  const netOwed = bucket?.netOwed ?? 0
  if (!(netOwed > MONEY_EPSILON)) return { ok: false, error: 'nothing_owed' }

  let amount = netOwed
  if (input.requested !== undefined && input.requested !== null && input.requested !== '') {
    const n = typeof input.requested === 'number' ? input.requested : Number(input.requested)
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'invalid_amount' }
    amount = roundMoney(Math.min(netOwed, n))
    if (!(amount > MONEY_EPSILON)) return { ok: false, error: 'invalid_amount' }
  }

  if (isAutomatedFeeRail(provider) && amount < MIN_AUTOMATED_FEE_PAYMENT_USD) {
    return { ok: false, error: 'amount_below_minimum' }
  }

  return {
    ok: true,
    value: { provider, currency, amount, netOwed, partial: amount < netOwed - MONEY_EPSILON },
  }
}

/** Live per-currency fee balances of a tenant (same arithmetic as the cron). */
export async function getTenantFeeBalances(admin: SupabaseClient, tenantId: string): Promise<FeeBalance[]> {
  const [config, ledger] = await Promise.all([loadFeeConfig(admin), loadTenantFeeLedger(admin, tenantId)])
  return computeFeeBalances(ledger.txns, ledger.payments, {
    fallbackSchoolPercentage: ledger.fallbackSchoolPercentage ?? undefined,
    hyperinflationCurrencies: config.hyperinflationCurrencies,
  })
}

/** Major → Stripe minor units (fee pay-now is USD only: two decimals). */
export function toMinorUnits(amount: number): number {
  return Math.round(roundMoney(amount) * 100)
}

/**
 * The amount `createCheckoutSession` expects for a fee payment. Stripe takes
 * minor units (cents); Binance Pay, PayPal and the other hosted rails take
 * major units (`orderAmount: toFixed(2)`). Sending cents to a major-unit rail
 * charges 100x, so the unit is decided here, in one place.
 */
export function feeCheckoutAmount(provider: string, amount: number): number {
  return provider === 'stripe' ? toMinorUnits(amount) : roundMoney(amount)
}
