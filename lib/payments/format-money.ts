/**
 * Money formatting for the payout screens.
 *
 * The invariant these helpers exist to hold: **amounts in different currencies
 * are never added together, and a currency code is never hardcoded at the
 * render site.** #497 fixed that on the super-admin payouts page, but the fix
 * lived in that page's local scope, so the school-facing payout history added
 * later re-introduced the same bug (#531). Keeping the grouping and the
 * formatting here — tested, in one place — is what stops the next payout screen
 * from re-deriving it a third time.
 *
 * No conversion happens anywhere in this module. A USD figure and a EUR figure
 * stay two figures.
 */

/** The minimum shape a row needs to be groupable: an amount and the currency it is denominated in. */
export interface MoneyRow {
  amount: number | null
  currency: string | null
}

/** Totals keyed by upper-cased ISO currency code, e.g. `{ USD: 1240.5, EUR: 860 }`. */
export type AmountsByCurrency = Record<string, number>

const DEFAULT_CURRENCY = 'USD'

/** Upper-cases the code and falls back to USD, so `'usd'`, `'USD'` and a null column share one bucket. */
const normalizeCurrency = (currency: string | null | undefined) =>
  (currency || DEFAULT_CURRENCY).toUpperCase()

/**
 * Formatted in the reader's locale; the currency code always comes from the
 * data, never from the call site.
 */
export function formatMoney(amount: number | null | undefined, currency: string | null | undefined, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalizeCurrency(currency),
  }).format(amount ?? 0)
}

/**
 * Groups rows into one total per currency. Callers filter first (e.g. to `paid`
 * payouts) and pass what survives — this only ever adds an amount to the bucket
 * for its own currency, so there is no arrangement of inputs that produces a
 * cross-currency sum.
 */
export function sumByCurrency(rows: readonly MoneyRow[]): AmountsByCurrency {
  const totals: AmountsByCurrency = {}
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency)
    totals[currency] = (totals[currency] ?? 0) + (row.amount ?? 0)
  }
  return totals
}

/**
 * Renders one figure per currency, joined — `"$1,240.50 · €860.00"`. Currencies
 * that net to zero are dropped so the common single-currency school still reads
 * as a single number; an empty set renders one zero rather than an empty card.
 */
export function formatByCurrency(byCurrency: AmountsByCurrency, locale: string) {
  const entries = Object.entries(byCurrency).filter(([, amount]) => amount !== 0)
  if (entries.length === 0) return formatMoney(0, DEFAULT_CURRENCY, locale)
  return entries.map(([currency, amount]) => formatMoney(amount, currency, locale)).join(' · ')
}
