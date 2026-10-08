/**
 * Pure helpers for the school-admin earnings page (#928). No DB access: the
 * page fetches rows and hands them to `buildEarningsView`, which is the whole
 * page's arithmetic in one unit-testable function.
 *
 * Two kinds of sale are covered, decided by the provider capability map
 * (`PROVIDER_CAPABILITIES`), never by `revenue_splits.applies_to_providers`
 * (retired in #547):
 *
 *  - SCHOOL-COLLECTED (`bearsPlatformFee: false` — today `manual`,
 *    `binance_personal`). The buyer pays the school directly; the platform
 *    never touches the money, so it cannot take its commission in flight. The
 *    commission ACCRUES AS A DEBT the school owes the platform ("Por pagar a
 *    la plataforma", Guaybo model). This is the read-only first slice of the
 *    platform fee ledger designed in docs/PLATFORM_FEE_LEDGER_DESIGN.md (#929):
 *    `accrued` is derived from transactions, and there is no payments table
 *    yet, so `paid` is 0 and `netOwed = accrued` until wave 2 ships
 *    `platform_fee_payments`.
 *
 *  - PLATFORM-COLLECTED (`settlesToPlatformAccount: true` — PayPal, Lemon
 *    Squeezy, Binance Pay merchant). The platform holds 100% and owes the
 *    school its share; that balance is `computeOwedBalances` from
 *    `payouts-owed.ts`, the same function the platform panel uses, so both
 *    screens reconcile to the cent. It is shown separately and NEVER offset
 *    against the debt above.
 *
 * Stripe Connect and Solana take the platform commission in the payment itself
 * (application fee / on-chain split), so nothing is owed in either direction
 * and they are out of scope here.
 *
 * Commission per row = `netOfRefunds(amount) - roundMoney(netOfRefunds(amount)
 * × school_percentage_snapshot / 100)`: the school share is rounded per row
 * (the #547 residue rule) and the commission is the remainder, exactly as
 * `computeOwedBalances` splits a row. #927's gross-up keeps the platform cut
 * equal to the snapshot rate × `amount`, so the formula holds for grossed-up
 * sales too.
 *
 * Dates: every boundary (month start, date filters, the dates shown in the
 * table) is UTC — the same choice the ledger design makes for statement
 * periods (R10), so "this month" here will match the monthly statement wave 2
 * issues. The page says so.
 */
import {
  computeOwedBalances,
  DEFAULT_SCHOOL_PERCENTAGE,
  MONEY_EPSILON,
  netOfRefunds,
  roundMoney,
} from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'

export type Collector = 'school' | 'platform'

const ALL_PROVIDERS = Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]

/** Rails where the buyer pays the school directly, so the commission becomes a debt. */
export const SCHOOL_COLLECTED_PROVIDERS: readonly PaymentProvider[] = ALL_PROVIDERS.filter(
  (p) => !PROVIDER_CAPABILITIES[p].bearsPlatformFee,
)

/** Rails where 100% lands in the platform account and the platform owes the school its share. */
export const PLATFORM_COLLECTED_PROVIDERS: readonly PaymentProvider[] = ALL_PROVIDERS.filter(
  (p) => PROVIDER_CAPABILITIES[p].bearsPlatformFee && PROVIDER_CAPABILITIES[p].settlesToPlatformAccount,
)

/** Every provider whose sales the earnings page lists. */
export const EARNINGS_PROVIDERS: readonly PaymentProvider[] = [
  ...SCHOOL_COLLECTED_PROVIDERS,
  ...PLATFORM_COLLECTED_PROVIDERS,
]

export function collectorOf(provider: string): Collector | null {
  if ((SCHOOL_COLLECTED_PROVIDERS as readonly string[]).includes(provider)) return 'school'
  if ((PLATFORM_COLLECTED_PROVIDERS as readonly string[]).includes(provider)) return 'platform'
  return null
}

export type EarningsStatusFilter = 'all' | 'counted' | 'pending' | 'refunded'
export type EarningsCollectorFilter = 'all' | Collector

export interface EarningsTxn {
  transactionId: number
  paymentProvider: string
  amount: number
  refundedAmount: number | null
  currency: string
  schoolPercentageSnapshot: number | null
  status: 'successful' | 'refunded' | 'pending'
  transactionDate: string
  productId?: number | null
  planId?: number | null
}

export interface EarningsRow extends EarningsTxn {
  /** Upper-cased currency code; balances are grouped by it and never summed across. */
  currencyCode: string
  collectedBy: Collector
  /** Sale net of refunds. */
  kept: number
  /** Platform commission on `kept`. */
  commission: number
  /** School's share of `kept`. */
  net: number
}

/**
 * Returns null for a provider outside both scopes (the page queries only
 * `EARNINGS_PROVIDERS`, so this is a guard, not a filter).
 */
export function toEarningsRow(
  txn: EarningsTxn,
  fallbackSchoolPercentage = DEFAULT_SCHOOL_PERCENTAGE,
): EarningsRow | null {
  const collectedBy = collectorOf(txn.paymentProvider)
  if (!collectedBy) return null
  const kept = netOfRefunds(txn.amount, txn.refundedAmount)
  const pct = txn.schoolPercentageSnapshot ?? fallbackSchoolPercentage
  const net = roundMoney((kept * pct) / 100)
  return {
    ...txn,
    currencyCode: (txn.currency || 'usd').toUpperCase(),
    collectedBy,
    kept,
    net,
    commission: roundMoney(kept - net),
  }
}

/**
 * A row moves a balance only when it is settled and something of it was kept.
 * A `successful` row refunded down to zero is excluded too, not just
 * `status = 'refunded'`.
 */
export function isCounted(r: EarningsRow): boolean {
  return r.status === 'successful' && r.kept > MONEY_EPSILON
}

export function isRefunded(r: EarningsRow): boolean {
  return r.status === 'refunded' || (r.refundedAmount ?? 0) > 0
}

export interface EarningsFilters {
  status: EarningsStatusFilter
  collector: EarningsCollectorFilter
  currency: string | null
  /** inclusive ISO dates (yyyy-mm-dd), UTC */
  from: string | null
  to: string | null
}

export function filterEarnings(rows: readonly EarningsRow[], f: EarningsFilters): EarningsRow[] {
  const fromMs = f.from ? Date.parse(`${f.from}T00:00:00.000Z`) : null
  const toMs = f.to ? Date.parse(`${f.to}T23:59:59.999Z`) : null
  return rows.filter((r) => {
    if (f.status === 'counted' && !isCounted(r)) return false
    if (f.status === 'pending' && r.status !== 'pending') return false
    if (f.status === 'refunded' && !isRefunded(r)) return false
    if (f.collector !== 'all' && r.collectedBy !== f.collector) return false
    if (f.currency && r.currencyCode !== f.currency.toUpperCase()) return false
    const at = Date.parse(r.transactionDate)
    if (fromMs != null && !Number.isNaN(fromMs) && at < fromMs) return false
    if (toMs != null && !Number.isNaN(toMs) && at > toMs) return false
    return true
  })
}

/** First instant of `now`'s calendar month, UTC. */
export function utcMonthStart(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
}

export interface FeeDebtBalance {
  currency: string
  /** Commission accrued on school-collected sales, all time, net of refunds. */
  accrued: number
  /** Fee payments received. Always 0 until the payments ledger ships (#929 wave 2). */
  paid: number
  /** accrued - paid, 0 at or below half a cent. */
  netOwed: number
  sales: number
}

/**
 * What the school owes the platform, per currency. Mirrors the ledger design's
 * §2.2 balance with `paid = 0`. Rounded per row (already done in
 * `toEarningsRow`), then summed.
 */
// TODO(#927): once feat/fee-bearer-927 (`transactions.fee_bearer`) merges,
// accrual must also filter on that column, not only `collectedBy`.
// TODO(#929): per the #929 design, hyperinflation currencies (VES) will later
// be shown as the USD snapshot recorded at sale time. Not implemented here.
export function accruePlatformFees(rows: readonly EarningsRow[]): FeeDebtBalance[] {
  const by = new Map<string, FeeDebtBalance>()
  for (const r of rows) {
    if (r.collectedBy !== 'school' || !isCounted(r)) continue
    let b = by.get(r.currencyCode)
    if (!b) {
      b = { currency: r.currencyCode, accrued: 0, paid: 0, netOwed: 0, sales: 0 }
      by.set(r.currencyCode, b)
    }
    b.accrued = roundMoney(b.accrued + r.commission)
    b.sales++
  }
  for (const b of by.values()) {
    const owed = roundMoney(b.accrued - b.paid)
    b.netOwed = owed > MONEY_EPSILON ? owed : 0
  }
  return Array.from(by.values()).sort((a, b) => a.currency.localeCompare(b.currency))
}

export interface MonthTotals {
  /** Gross kept this month, per currency. */
  sales: Record<string, number>
  /** Platform commission this month, per currency (both collectors). */
  commission: Record<string, number>
  /** School's net this month, per currency. */
  net: Record<string, number>
  count: number
}

/**
 * Scope differs from `accruePlatformFees`: this covers BOTH collectors
 * (platform- and school-collected), while the debt covers school-collected
 * only. The page labels the month card accordingly.
 * Counted rows dated in `now`'s UTC calendar month. */
export function monthTotals(rows: readonly EarningsRow[], now: Date): MonthTotals {
  const start = utcMonthStart(now)
  const out: MonthTotals = { sales: {}, commission: {}, net: {}, count: 0 }
  for (const r of rows) {
    if (!isCounted(r)) continue
    const at = Date.parse(r.transactionDate)
    if (Number.isNaN(at) || at < start) continue
    const c = r.currencyCode
    out.sales[c] = roundMoney((out.sales[c] ?? 0) + r.kept)
    out.commission[c] = roundMoney((out.commission[c] ?? 0) + r.commission)
    out.net[c] = roundMoney((out.net[c] ?? 0) + r.net)
    out.count++
  }
  return out
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, totalPages, total: items.length }
}

// ─── Page assembly ───────────────────────────────────────────────────────────

export type RawSearchParams = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const isoDate = (v: string | undefined) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null

export function parseEarningsQuery(
  sp: RawSearchParams,
  currencies: readonly string[],
): EarningsFilters & { page: number } {
  const s = first(sp.status)
  const status: EarningsStatusFilter = s === 'counted' || s === 'pending' || s === 'refunded' ? s : 'all'
  const c = first(sp.collector)
  const collector: EarningsCollectorFilter = c === 'school' || c === 'platform' ? c : 'all'
  const cur = first(sp.currency)?.toUpperCase()
  return {
    status,
    collector,
    currency: cur && currencies.includes(cur) ? cur : null,
    from: isoDate(first(sp.from)),
    to: isoDate(first(sp.to)),
    page: Number(first(sp.page)) || 1,
  }
}

export interface EarningsPayout {
  amount: number
  currency: string
  coveredThrough: string | null
}

export interface EarningsViewInput {
  tenantId: string
  txns: readonly EarningsTxn[]
  /** Manual payouts already marked paid to this school (platform-collected side). */
  payouts: readonly EarningsPayout[]
  /** Current revenue_splits.school_percentage, the fallback for unsnapshotted rows. */
  schoolPercentage: number
  /** Open manual payment requests (statuses `pending` + `contacted`). */
  openRequests: number
  now: Date
  searchParams: RawSearchParams
  pageSize: number
}

export function buildEarningsView(input: EarningsViewInput) {
  const rows = input.txns
    .map((t) => toEarningsRow(t, input.schoolPercentage))
    .filter((r): r is EarningsRow => r != null)
    .sort(
      (a, b) =>
        Date.parse(b.transactionDate) - Date.parse(a.transactionDate) || b.transactionId - a.transactionId,
    )

  const feeDebt = accruePlatformFees(rows)

  // Platform owes the school: the same function and inputs getPayoutsOwed uses.
  const platformRows = rows.filter((r) => r.collectedBy === 'platform' && r.status !== 'pending')
  const [owed] = computeOwedBalances(
    [{ tenantId: input.tenantId, tenantName: '', schoolPercentage: input.schoolPercentage }],
    platformRows.map((r) => ({
      tenantId: input.tenantId,
      paymentProvider: r.paymentProvider,
      amount: r.amount,
      refundedAmount: r.refundedAmount,
      currency: r.currencyCode,
      schoolPercentageSnapshot: r.schoolPercentageSnapshot,
      status: r.status as 'successful' | 'refunded',
      transactionDate: r.transactionDate,
    })),
    input.payouts.map((p) => ({
      tenantId: input.tenantId,
      amount: p.amount,
      currency: (p.currency || 'usd').toUpperCase(),
      coveredThrough: p.coveredThrough,
    })),
  )
  const platformOwes: Record<string, number> = {}
  for (const b of owed?.balances ?? []) {
    if (b.netOwed > MONEY_EPSILON) platformOwes[b.currency] = b.netOwed
  }

  const currencies = Array.from(new Set(rows.map((r) => r.currencyCode))).sort()
  const query = parseEarningsQuery(input.searchParams, currencies)
  const filtered = filterEarnings(rows, query)
  const page = paginate(filtered, query.page, input.pageSize)

  return {
    feeDebt,
    hasSchoolCollectedSales: rows.some((r) => r.collectedBy === 'school'),
    platformOwes,
    hasPlatformCollectedSales: platformRows.length > 0,
    month: monthTotals(rows, input.now),
    openRequests: input.openRequests,
    currencies,
    filters: query,
    page,
  }
}

export type EarningsView = ReturnType<typeof buildEarningsView>
