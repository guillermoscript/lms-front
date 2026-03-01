/**
 * Currency utilities for handling multi-currency payments.
 * Stripe uses minor units (cents) for most currencies,
 * but some currencies are "zero-decimal" (no cents).
 */

export const ZERO_DECIMAL_CURRENCIES = new Set([
  'clp', 'jpy', 'krw', 'vnd', 'pyg', 'ugx', 'rwf',
])

export const SUPPORTED_CURRENCIES = [
  { code: 'usd', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'mxn', name: 'Mexican Peso', symbol: '$', flag: '🇲🇽' },
  { code: 'cop', name: 'Colombian Peso', symbol: '$', flag: '🇨🇴' },
  { code: 'clp', name: 'Chilean Peso', symbol: '$', flag: '🇨🇱' },
  { code: 'pen', name: 'Peruvian Sol', symbol: 'S/', flag: '🇵🇪' },
  { code: 'ars', name: 'Argentine Peso', symbol: '$', flag: '🇦🇷' },
  { code: 'brl', name: 'Brazilian Real', symbol: 'R$', flag: '🇧🇷' },
  { code: 'eur', name: 'Euro', symbol: '€', flag: '🇪🇺' },
] as const

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]['code']

/**
 * Convert a display amount to Stripe's minor units.
 * For most currencies: $10.00 → 1000 (cents)
 * For zero-decimal currencies: $10 → 10
 */
export function toCents(amount: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())) {
    return Math.round(amount)
  }
  return Math.round(amount * 100)
}

/**
 * Convert Stripe's minor units back to display amount.
 */
export function fromCents(cents: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())) {
    return cents
  }
  return cents / 100
}

/**
 * Format a currency amount for display using Intl.NumberFormat.
 * @param amount - Amount in display units (not cents)
 * @param currency - ISO 4217 currency code
 * @param locale - BCP 47 locale string (defaults to 'en-US')
 */
export function formatCurrency(
  amount: number,
  currency: string = 'usd',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 0 : 2,
    maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 0 : 2,
  }).format(amount)
}

/**
 * Get the routing number label for a given country.
 * Different countries use different terms for their bank routing numbers.
 */
export function getRoutingNumberLabel(countryCode: string): string {
  const labels: Record<string, string> = {
    MX: 'CLABE',
    AR: 'CBU/CVU',
    PE: 'CCI',
    CO: 'Account Number',
    CL: 'RUT / Account Number',
    BR: 'Agency / Account',
    US: 'Routing Number',
  }
  return labels[countryCode.toUpperCase()] || 'Routing Number'
}
