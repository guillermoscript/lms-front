/**
 * Pure, client-safe helpers for the school-facing platform fee view (#929,
 * design 4.4): owed buckets (never summed across currencies), Pay-now rails
 * and amount check, converted-sale summaries with their frozen rates, and the
 * banner decision. No DB, no server-only imports: the Pay-now dialog (client)
 * imports this module. Loaders live in `platform-fee-account.ts`.
 */
import { MONEY_EPSILON, roundMoney } from '@/lib/payments/payouts-owed'
import { feeForTxn, FEE_LEDGER_USD, type FeeBalance, type FeeLedgerOptions, type FeeLedgerTxn } from '@/lib/payments/platform-fee-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'

export type FeeStandingState = 'ok' | 'reminded' | 'overdue' | 'blocked'
export type FeeEnforcementMode = 'off' | 'notify_only' | 'enforce'

/** A ledger sale with the FX snapshot stored on it at insert (hyperinflation currencies). */
export interface FeeTxnWithFx extends FeeLedgerTxn {
  fxRateToUsd?: number | null
  fxRateSource?: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Smallest automated payment (Stripe refuses under $0.50; same floor on every automated rail). Mirrors MIN_AUTOMATED_FEE_PAYMENT_USD in platform-fee-paynow. */
export const MIN_AUTOMATED_FEE_PAYMENT_USD = 0.5

/** Every rail the dialog knows how to present, in display order: cards/PayPal, crypto, manual last. */
const FEE_DIALOG_RAIL_ORDER = ['stripe', 'paypal', 'binance', 'solana', 'manual'] as const satisfies readonly PaymentProvider[]

export type FeeRail = (typeof FEE_DIALOG_RAIL_ORDER)[number]

/** Rails offered in the Pay-now dialog, in display order. Capability-driven, never a slug list. */
export const FEE_DIALOG_RAILS: readonly FeeRail[] = FEE_DIALOG_RAIL_ORDER.filter(
  (p) => PROVIDER_CAPABILITIES[p]?.supportsPlatformFeePayNow === true,
)

export interface FeeStandingSnapshot {
  state: FeeStandingState
  overdueSince: string | null
  blockedAt: string | null
  enforcementExempt: boolean
}

// ─── pure helpers ───────────────────────────────────────────────────────────

/** Buckets with something owed, per currency, never summed. */
export function owedBuckets(balances: readonly FeeBalance[]): FeeBalance[] {
  return balances.filter((b) => b.netOwed > MONEY_EPSILON).sort((a, b) => a.currency.localeCompare(b.currency))
}

/** `{ USD: 12.5, EUR: 3 }` for `formatByCurrency` (which never adds across keys). */
export function owedByCurrency(balances: readonly FeeBalance[]): Record<string, number> {
  return Object.fromEntries(owedBuckets(balances).map((b) => [b.currency, b.netOwed]))
}

export function overpaidByCurrency(balances: readonly FeeBalance[]): Record<string, number> {
  return Object.fromEntries(balances.filter((b) => b.overpaid > MONEY_EPSILON).map((b) => [b.currency, b.overpaid]))
}

/**
 * Rails the school can pick for one bucket. Automated rails are USD-only
 * (platform billing is `expectedCurrency: 'usd'`) and need at least the
 * automated minimum; Stripe additionally needs its key configured here (the
 * other rails answer `provider_unavailable` from the route when unconfigured).
 * The bank transfer rail takes any ledger currency.
 */
export function feeRailsFor(
  currency: string,
  netOwed: number,
  opts: { cardConfigured: boolean },
): FeeRail[] {
  const automatedOk = currency.toUpperCase() === FEE_LEDGER_USD && netOwed >= MIN_AUTOMATED_FEE_PAYMENT_USD
  return FEE_DIALOG_RAILS.filter((p) => {
    if (p === 'manual') return true
    if (!automatedOk) return false
    return p === 'stripe' ? opts.cardConfigured : true
  })
}

/**
 * What the dialog does with a successful `POST /api/billing/fees/checkout`
 * body: Solana answers `kind: 'qr'` (its `url` is a `solana:` wallet URI, so
 * the school goes to the in-app QR page `checkoutPath`); every hosted rail
 * answers a `url` to navigate to. `manual` (`instructions`) is handled by the
 * caller before this. Same-origin paths only for `push`.
 */
export function payNowNavigation(body: Record<string, unknown>): { type: 'push' | 'assign'; to: string } | null {
  if (body.kind === 'qr') {
    const path = body.checkoutPath
    return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? { type: 'push', to: path } : null
  }
  return typeof body.url === 'string' && body.url ? { type: 'assign', to: body.url } : null
}

export interface PayNowBucket {
  currency: string
  netOwed: number
  rails: FeeRail[]
}

export function payNowBuckets(balances: readonly FeeBalance[], opts: { cardConfigured: boolean }): PayNowBucket[] {
  return owedBuckets(balances)
    .map((b) => ({ currency: b.currency, netOwed: b.netOwed, rails: feeRailsFor(b.currency, b.netOwed, opts) }))
    .filter((b) => b.rails.length > 0)
}

/**
 * Validate the amount typed in the Pay-now dialog. The server caps it again at
 * the live balance; this only keeps an obviously wrong value from being sent.
 */
export function parsePayNowAmount(
  raw: string,
  netOwed: number,
  rail: FeeRail,
): { ok: true; amount: number } | { ok: false; error: 'invalid_amount' | 'amount_above_balance' | 'amount_below_minimum' } {
  const trimmed = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, error: 'invalid_amount' }
  const amount = Number(trimmed)
  if (!(amount > MONEY_EPSILON)) return { ok: false, error: 'invalid_amount' }
  if (amount > netOwed + MONEY_EPSILON) return { ok: false, error: 'amount_above_balance' }
  if (rail !== 'manual' && amount < MIN_AUTOMATED_FEE_PAYMENT_USD) return { ok: false, error: 'amount_below_minimum' }
  return { ok: true, amount: roundMoney(amount) }
}

export interface ConvertedSalesLine {
  /** Sale currency, e.g. VES. */
  currency: string
  count: number
  /** Sales net of refunds, in the sale currency. */
  salesTotal: number
  /** USD base those sales were converted to at sale time. */
  usdTotal: number
  /** Distinct rate + source pairs, most recent sale first, at most `maxRates`. */
  rates: { rate: number; source: string | null; date: string }[]
}

/**
 * Hyperinflation sales that landed in the USD bucket, grouped by sale
 * currency, with the rate and source frozen on each sale (design 2.1). Rates
 * are as stored — never re-converted.
 */
export function summarizeConvertedSales(
  txns: readonly FeeTxnWithFx[],
  opts: FeeLedgerOptions = {},
  maxRates = 3,
): ConvertedSalesLine[] {
  const by = new Map<string, ConvertedSalesLine & { _seen: Map<string, string> }>()
  const sorted = [...txns].sort((a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate))
  for (const t of sorted) {
    const line = feeForTxn(t, opts)
    if (!line || !line.converted) continue
    let g = by.get(line.sourceCurrency)
    if (!g) {
      g = { currency: line.sourceCurrency, count: 0, salesTotal: 0, usdTotal: 0, rates: [], _seen: new Map() }
      by.set(line.sourceCurrency, g)
    }
    g.count++
    g.salesTotal = roundMoney(g.salesTotal + line.kept)
    g.usdTotal = roundMoney(g.usdTotal + line.base)
    const rate = t.fxRateToUsd != null && Number.isFinite(t.fxRateToUsd) && t.fxRateToUsd > 0 ? t.fxRateToUsd : null
    if (rate !== null) {
      const key = `${rate}|${t.fxRateSource ?? ''}`
      if (!g._seen.has(key) && g.rates.length < maxRates) {
        g._seen.set(key, t.transactionDate)
        g.rates.push({ rate, source: t.fxRateSource ?? null, date: t.transactionDate })
      }
    }
  }
  return Array.from(by.values())
    .map((g) => ({ currency: g.currency, count: g.count, salesTotal: g.salesTotal, usdTotal: g.usdTotal, rates: g.rates }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

export type FeeBannerVariant = 'reminded' | 'overdue' | 'blocked'

export interface FeeBannerNotice {
  variant: FeeBannerVariant
  owed: Record<string, number>
  /** Due date of the latest statement (reminded). */
  dueAt: string | null
  /** When new sales pause, if they will (overdue, enforce mode, not exempt). */
  blockOn: string | null
}

/**
 * What the dashboard-shell banner shows, or null for nothing. The live balance
 * wins over a stale standing: nothing owed → no banner (settle re-evaluates
 * synchronously, so this only bridges a race).
 */
export function describeFeeBanner(input: {
  standing: FeeStandingSnapshot | null
  balances: readonly FeeBalance[]
  enforcementMode: FeeEnforcementMode
  graceDays: number
  latestDueAt: string | null
}): FeeBannerNotice | null {
  const { standing } = input
  if (!standing || standing.state === 'ok') return null
  const owed = owedByCurrency(input.balances)
  if (Object.keys(owed).length === 0) return null

  if (standing.blockedAt) return { variant: 'blocked', owed, dueAt: input.latestDueAt, blockOn: null }

  if (standing.state === 'overdue' || standing.state === 'blocked') {
    let blockOn: string | null = null
    if (input.enforcementMode === 'enforce' && !standing.enforcementExempt && standing.overdueSince) {
      const since = Date.parse(standing.overdueSince)
      if (!Number.isNaN(since)) blockOn = new Date(since + input.graceDays * DAY_MS).toISOString()
    }
    return { variant: 'overdue', owed, dueAt: input.latestDueAt, blockOn }
  }

  return { variant: 'reminded', owed, dueAt: input.latestDueAt, blockOn: null }
}

/** Map an API / action error code to a message key, with a generic fallback. */
export function feeErrorKey(code: unknown, known: readonly string[]): string {
  return typeof code === 'string' && known.includes(code) ? code : 'generic'
}
