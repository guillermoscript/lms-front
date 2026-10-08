/**
 * Format a price in the page locale (not a hard-coded 'en-US'). Returns null
 * for a free / missing price so the caller can show its own translated "Free".
 * Currencies are stored lowercase (`usd`); Intl wants ISO upper case.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: string
): string | null {
  if (amount == null || Number(amount) <= 0) return null
  const value = Number(amount)
  const code = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value)
  } catch {
    return `${value} ${code}`
  }
}
