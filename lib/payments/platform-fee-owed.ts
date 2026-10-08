/**
 * Platform fee ledger arithmetic (#929, design: docs/PLATFORM_FEE_LEDGER_DESIGN.md
 * sections 2.1, 2.2 and D4). Pure functions, no DB access — the mirror image of
 * `payouts-owed.ts`: there the platform owes the school, here the school owes
 * the platform its commission on sales it collected directly.
 *
 * Shared by the admin earnings page (#928, `accruePlatformFees` in
 * `lib/payments/earnings.ts` delegates here) and, in later #929 slices, by the
 * enforcement cron and pay-now, so every screen and the ledger reconcile to the
 * cent. The SQL mirror for the synchronous re-evaluation lives in
 * `public.platform_fee_ledger()` (migration 20261009100000); keep both in step
 * (tests/unit/platform-fee-owed.test.ts checks the provider list).
 *
 * Rules:
 *  - Eligibility keys on the transaction's OWN `payment_provider` slug, looked
 *    up in `PROVIDER_CAPABILITIES` (D10): only rails with
 *    `bearsPlatformFee: false` accrue a debt. Never `products.payment_provider`
 *    (editable, re-prices history like #496) and never
 *    `revenue_splits.applies_to_providers` (retired in #547).
 *  - The fee bearer (#927) does NOT filter: `amount` is what the buyer paid,
 *    grossed up when the student bore the fee, and the platform's cut is
 *    `(100 - school_percentage_snapshot)%` of it either way.
 *  - Per row: `kept = netOfRefunds(amount, refunded_amount)`; the school share
 *    is `roundMoney(kept × pct / 100)` and the fee is the remainder. Rounded per
 *    row, then summed (the #547 residue rule). This is exactly how
 *    `computeOwedBalances` splits a row, so fee + school share = kept with no
 *    residue on either side.
 *  - Rate from the row's own `school_percentage_snapshot`; a legacy NULL falls
 *    back to the caller's current split (`DEFAULT_SCHOOL_PERCENTAGE` if none).
 *  - Grouped per ledger currency, never summed across currencies.
 *  - Hyperinflation currencies (VES initially; `platform_fee_config`) are
 *    tracked in USD from the snapshot stored on the row at insert
 *    (`usd_amount`): never re-converted. A partial refund is converted at the
 *    row's stored rate: `usd_net = roundMoney(usd_amount × kept / amount)`. A
 *    row in such a currency WITHOUT a snapshot stays in its own currency bucket
 *    (there is no honest rate to apply after the fact).
 *  - Payments: only `succeeded` rows count. Overpayment carries forward
 *    (`overpaid`), never a negative balance; compare with `MONEY_EPSILON`,
 *    never 0.
 *  - Overdue (D4) is stateless: fees accrued before the latest passed due
 *    boundary, minus all-time payments, above `MONEY_EPSILON`.
 */
import {
  DEFAULT_SCHOOL_PERCENTAGE,
  MONEY_EPSILON,
  netOfRefunds,
  roundMoney,
} from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'

/** Days after month close (the 1st, 00:00 UTC) a statement falls due. */
export const FEE_DUE_DAYS = 3

/** Mirrors `platform_fee_config.hyperinflation_currencies` default. */
export const DEFAULT_HYPERINFLATION_CURRENCIES: readonly string[] = ['VES']

/** Ledger currency for converted hyperinflation sales. */
export const FEE_LEDGER_USD = 'USD'

/** Rails where the buyer pays the school directly, so the commission becomes a debt. */
export const FEE_LEDGER_PROVIDERS: readonly PaymentProvider[] = (
  Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]
).filter((p) => !PROVIDER_CAPABILITIES[p].bearsPlatformFee)

export function isFeeLedgerProvider(provider: string | null | undefined): boolean {
  return provider != null && (FEE_LEDGER_PROVIDERS as readonly string[]).includes(provider)
}

export interface FeeLedgerTxn {
  /** transactions.payment_provider (the slug on the row, D10). */
  paymentProvider: string
  /** Major units, in `currency`. */
  amount: number
  refundedAmount: number | null
  /** transactions.currency; case-insensitive. Null is treated as USD. */
  currency: string | null
  schoolPercentageSnapshot: number | null
  status: string
  transactionDate: string
  /** transactions.usd_amount — insert-time USD snapshot, hyperinflation currencies only. */
  usdAmount?: number | null
}

export interface FeePayment {
  amount: number
  currency: string
  status: string
}

export interface FeeLedgerOptions {
  /** Current revenue_splits.school_percentage, used for rows with a NULL snapshot. */
  fallbackSchoolPercentage?: number
  hyperinflationCurrencies?: readonly string[]
}

export interface FeeLine {
  /** Bucket the fee lands in (USD for converted hyperinflation sales). */
  ledgerCurrency: string
  /** The sale's own currency, upper-cased. */
  sourceCurrency: string
  /** Sale net of refunds, in the sale currency. */
  kept: number
  /** Fee base in the ledger currency (= kept unless converted). */
  base: number
  fee: number
  converted: boolean
}

const upper = (c: string | null | undefined) => (c || 'usd').toUpperCase()

/**
 * The fee one transaction contributes, or null when it contributes nothing
 * (ineligible rail, not `successful`, free, or refunded down to zero).
 */
export function feeForTxn(txn: FeeLedgerTxn, opts: FeeLedgerOptions = {}): FeeLine | null {
  if (!isFeeLedgerProvider(txn.paymentProvider)) return null
  if (txn.status !== 'successful') return null
  if (!(txn.amount > 0)) return null
  const kept = netOfRefunds(txn.amount, txn.refundedAmount)
  if (kept <= MONEY_EPSILON) return null

  const sourceCurrency = upper(txn.currency)
  const hyper = (opts.hyperinflationCurrencies ?? DEFAULT_HYPERINFLATION_CURRENCIES).map((c) => c.toUpperCase())
  const converted = hyper.includes(sourceCurrency) && txn.usdAmount != null
  const base = converted ? roundMoney(((txn.usdAmount as number) * kept) / txn.amount) : kept
  const pct = txn.schoolPercentageSnapshot ?? opts.fallbackSchoolPercentage ?? DEFAULT_SCHOOL_PERCENTAGE
  const schoolShare = roundMoney((base * pct) / 100)
  return {
    ledgerCurrency: converted ? FEE_LEDGER_USD : sourceCurrency,
    sourceCurrency,
    kept,
    base,
    fee: roundMoney(base - schoolShare),
    converted,
  }
}

export interface FeeBalance {
  currency: string
  /** Fees accrued, net of refunds (all time, or before `accruedBefore`). */
  accrued: number
  /** Succeeded fee payments, all time. */
  paid: number
  /** accrued - paid, 0 at or below half a cent. */
  netOwed: number
  /** paid - accrued when above half a cent; carried forward, never a reverse row. */
  overpaid: number
  /** Rows that accrued a fee. */
  sales: number
}

export interface ComputeFeeBalancesOptions extends FeeLedgerOptions {
  /** Only accrue rows dated strictly before this instant (ms). Payments are always all-time (D4). */
  accruedBefore?: number
}

export function computeFeeBalances(
  txns: readonly FeeLedgerTxn[],
  payments: readonly FeePayment[] = [],
  opts: ComputeFeeBalancesOptions = {},
): FeeBalance[] {
  const by = new Map<string, FeeBalance>()
  const bucket = (currency: string) => {
    let b = by.get(currency)
    if (!b) {
      b = { currency, accrued: 0, paid: 0, netOwed: 0, overpaid: 0, sales: 0 }
      by.set(currency, b)
    }
    return b
  }

  for (const t of txns) {
    if (opts.accruedBefore != null) {
      const at = Date.parse(t.transactionDate)
      if (Number.isNaN(at) || at >= opts.accruedBefore) continue
    }
    const line = feeForTxn(t, opts)
    if (!line) continue
    const b = bucket(line.ledgerCurrency)
    b.accrued = roundMoney(b.accrued + line.fee)
    b.sales++
  }

  for (const p of payments) {
    if (p.status !== 'succeeded' || !(p.amount > 0)) continue
    const b = bucket(upper(p.currency))
    b.paid = roundMoney(b.paid + p.amount)
  }

  for (const b of by.values()) {
    const owed = roundMoney(b.accrued - b.paid)
    b.netOwed = owed > MONEY_EPSILON ? owed : 0
    b.overpaid = -owed > MONEY_EPSILON ? roundMoney(-owed) : 0
  }
  return Array.from(by.values()).sort((a, b) => a.currency.localeCompare(b.currency))
}

/**
 * The latest due boundary at `now` (UTC). A calendar month closes on the 1st
 * at 00:00 UTC and its statement is due `FEE_DUE_DAYS` later; it is overdue
 * once `now` is strictly past that instant. `accrualCutoff` is the close of
 * the latest period whose due date has passed: rows dated before it are due.
 */
export function latestFeeDueBoundary(now: Date): { accrualCutoff: Date; dueAt: Date } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const dueThisMonth = Date.UTC(y, m, 1 + FEE_DUE_DAYS)
  if (now.getTime() > dueThisMonth) {
    return { accrualCutoff: new Date(Date.UTC(y, m, 1)), dueAt: new Date(dueThisMonth) }
  }
  return {
    accrualCutoff: new Date(Date.UTC(y, m - 1, 1)),
    dueAt: new Date(Date.UTC(y, m - 1, 1 + FEE_DUE_DAYS)),
  }
}

export interface OverdueBalance {
  currency: string
  /** Fees accrued before the cutoff minus all-time payments; > MONEY_EPSILON. */
  overdue: number
  dueAt: Date
}

/** D4: stateless overdue test, per currency bucket. Only buckets with something overdue are returned. */
export function overdueFeeBalances(
  txns: readonly FeeLedgerTxn[],
  payments: readonly FeePayment[],
  now: Date,
  opts: FeeLedgerOptions = {},
): OverdueBalance[] {
  const { accrualCutoff, dueAt } = latestFeeDueBoundary(now)
  return computeFeeBalances(txns, payments, { ...opts, accruedBefore: accrualCutoff.getTime() })
    .filter((b) => b.netOwed > MONEY_EPSILON)
    .map((b) => ({ currency: b.currency, overdue: b.netOwed, dueAt }))
}

export function isFeeOverdue(
  txns: readonly FeeLedgerTxn[],
  payments: readonly FeePayment[],
  now: Date,
  opts: FeeLedgerOptions = {},
): boolean {
  return overdueFeeBalances(txns, payments, now, opts).length > 0
}
