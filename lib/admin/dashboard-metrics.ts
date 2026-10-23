import { netOfRefunds } from '@/lib/payments/payouts-owed'

const DAY_MS = 86_400_000

/** How a figure moved against the previous window. `none` = nothing to compare. */
export type Delta =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'change'; percent: number }

/** Percent change, rounded; `new` when there was nothing before, `none` when both are 0. */
export function computeDelta(current: number, previous: number): Delta {
  if (previous === 0) return current === 0 ? { kind: 'none' } : { kind: 'new' }
  return { kind: 'change', percent: Math.round(((current - previous) / previous) * 100) }
}

export interface RevenueRow {
  amount: number | null
  refunded_amount: number | null
  transaction_date: string
}

export interface RevenueWindows {
  current: number
  previous: number
  /** One point per day for the current window, oldest first, zero-filled. */
  series: { day: string; revenue: number }[]
}

/**
 * Folds successful transactions into two rolling windows ending at `now`:
 * the last `days` days and the `days` before them. Rows older than both
 * windows (or in the future) are ignored. Amounts are net of refunds (#547).
 * `day` is an ISO date (UTC); the caller formats it for display.
 */
export function foldRevenueWindows(rows: readonly RevenueRow[], now: Date, days = 30): RevenueWindows {
  const series = Array.from({ length: days }, (_, i) => ({
    day: new Date(now.getTime() - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
    revenue: 0,
  }))
  let current = 0
  let previous = 0
  for (const row of rows) {
    const age = now.getTime() - new Date(row.transaction_date).getTime()
    if (age < 0) continue
    const bucket = Math.floor(age / DAY_MS) // 0 = last 24h
    const kept = netOfRefunds(row.amount || 0, row.refunded_amount)
    if (bucket < days) {
      current += kept
      series[days - 1 - bucket].revenue += kept
    } else if (bucket < days * 2) {
      previous += kept
    }
  }
  return { current, previous, series }
}

/** A plan limit of -1 / missing / non-finite means unlimited (lib/billing/plan-limits.ts). */
export function isUnlimited(limit: number | null | undefined): boolean {
  return limit == null || !Number.isFinite(limit) || limit < 0
}
