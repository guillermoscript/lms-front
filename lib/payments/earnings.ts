/**
 * Pure helpers for the school-admin earnings page (#928). Read-only maths over
 * a tenant's platform-settled transactions (PayPal / Lemon Squeezy / Binance
 * hosted) — the ones where the platform collects 100% and owes the school its
 * share. Uses the same primitives as `getPayoutsOwed` (`roundMoney`,
 * `netOfRefunds`, `computeOwedBalances`) so the school-facing balance
 * reconciles to the cent with the platform-facing one.
 */
import {
  DEFAULT_SCHOOL_PERCENTAGE,
  netOfRefunds,
  roundMoney,
} from '@/lib/payments/payouts-owed'

export type EarningsStatusFilter = 'all' | 'payable' | 'pending'

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
  /** Sale net of refunds. */
  kept: number
  /** Platform commission on `kept`. */
  commission: number
  /** School's share of `kept`. */
  net: number
}

/** Same per-transaction rounding as `computeOwedBalances`: school share rounded, commission is the remainder. */
export function toEarningsRow(txn: EarningsTxn, fallbackSchoolPercentage = DEFAULT_SCHOOL_PERCENTAGE): EarningsRow {
  const kept = netOfRefunds(txn.amount, txn.refundedAmount)
  const pct = txn.schoolPercentageSnapshot ?? fallbackSchoolPercentage
  const net = roundMoney((kept * pct) / 100)
  return { ...txn, kept, net, commission: roundMoney(kept - net) }
}

export interface EarningsFilters {
  status: EarningsStatusFilter
  currency: string | null
  /** inclusive ISO dates (yyyy-mm-dd) */
  from: string | null
  to: string | null
}

export function filterEarnings(rows: readonly EarningsRow[], f: EarningsFilters): EarningsRow[] {
  const fromMs = f.from ? Date.parse(`${f.from}T00:00:00.000Z`) : null
  const toMs = f.to ? Date.parse(`${f.to}T23:59:59.999Z`) : null
  return rows.filter((r) => {
    if (f.status === 'payable' && r.status === 'pending') return false
    if (f.status === 'pending' && r.status !== 'pending') return false
    if (f.currency && r.currency.toUpperCase() !== f.currency.toUpperCase()) return false
    const at = Date.parse(r.transactionDate)
    if (fromMs != null && !Number.isNaN(fromMs) && at < fromMs) return false
    if (toMs != null && !Number.isNaN(toMs) && at > toMs) return false
    return true
  })
}

/** Month total over settled rows (successful, net of refunds), one figure per currency. */
export function monthTotals(rows: readonly EarningsRow[], now: Date): { byCurrency: Record<string, number>; count: number } {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const byCurrency: Record<string, number> = {}
  let count = 0
  for (const r of rows) {
    if (r.status !== 'successful') continue
    if (Date.parse(r.transactionDate) < start) continue
    const c = r.currency.toUpperCase()
    byCurrency[c] = roundMoney((byCurrency[c] ?? 0) + r.net)
    count++
  }
  return { byCurrency, count }
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, totalPages, total: items.length }
}
