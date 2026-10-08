/**
 * Who bears the platform fee on a product sale (issue #927).
 *
 * `school` (default) — the buyer pays the listed price and the platform's cut
 * is deducted from it. `student` — the price is GROSSED UP so that, after the
 * platform takes its usual percentage of what the buyer paid, the school
 * receives the listed price: $100 at a 20% fee → the buyer pays $125, the
 * platform keeps 20% of $125 = $25, the school receives $100.
 *
 * Grossing up rather than adding `price × fee%` keeps the platform's cut
 * defined the one way every money path already computes it — the
 * transaction's `school_percentage_snapshot` applied to `transactions.amount`
 * (`computeOwedBalances`, `computeRevenueTotals`, Stripe's
 * `application_fee_amount`). So both bearers reconcile across the school and
 * platform screens with no change to those sums, `netOfRefunds()` keeps
 * working for partial refunds, and a full refund returns the surcharge to the
 * buyer along with the price.
 *
 * The surcharge only applies where it means something:
 *   - the provider must take a platform fee (`bearsPlatformFee`) — `manual` and
 *     `binance_personal` pay the school directly, so there is no fee to pass on;
 *   - the provider must charge OUR amount. Lemon Squeezy charges the price of
 *     the variant configured in its own dashboard, so a grossed-up amount here
 *     would never reach the buyer; it is excluded and the school bears the fee.
 *
 * Everything here is pure and server/client-safe: the checkout routes use it to
 * derive the charged amount, the checkout page to show the same number, and
 * the product editor to preview the breakdown.
 */

import { ZERO_DECIMAL_CURRENCIES } from '@/lib/currency'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from './types'

export const FEE_BEARERS = ['school', 'student'] as const
export type FeeBearer = (typeof FEE_BEARERS)[number]
export const DEFAULT_FEE_BEARER: FeeBearer = 'school'

export function isFeeBearer(value: unknown): value is FeeBearer {
  return typeof value === 'string' && (FEE_BEARERS as readonly string[]).includes(value)
}

/** Unknown / missing values read as the default — the historical behaviour. */
export function normalizeFeeBearer(value: unknown): FeeBearer {
  return isFeeBearer(value) ? value : DEFAULT_FEE_BEARER
}

/**
 * Providers that bear a platform fee but charge a price configured on their
 * side rather than the amount we send, so a surcharge cannot be applied.
 */
const PROVIDER_PRICED_CHECKOUT = new Set<string>(['lemonsqueezy'])

/** Can a `student` bearer actually be honoured on this provider? */
export function canPassFeeToStudent(provider: string | null | undefined): boolean {
  if (!provider) return false
  const caps = PROVIDER_CAPABILITIES[provider as PaymentProvider]
  if (!caps?.bearsPlatformFee) return false
  return !PROVIDER_PRICED_CHECKOUT.has(provider)
}

/**
 * The bearer that actually applies to a sale: the product's setting, gated on
 * the provider. This is what gets snapshotted on `transactions.fee_bearer`.
 */
export function effectiveFeeBearer(
  productBearer: unknown,
  provider: string | null | undefined,
): FeeBearer {
  const bearer = normalizeFeeBearer(productBearer)
  return bearer === 'student' && canPassFeeToStudent(provider) ? 'student' : 'school'
}

/** Round UP to the currency's minor unit, ignoring float noise below it. */
function ceilMoney(value: number, currency: string): number {
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100
  return Math.ceil(value * factor - 1e-6) / factor
}

/** Round half-up to the currency's minor unit. */
function roundMoneyIn(value: number, currency: string): number {
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100
  return Math.round(value * factor + 1e-6) / factor
}

/**
 * What the buyer is charged for a listed `price`, in major units.
 *
 * `school` → the price unchanged. `student` → `price / (1 − platform%)`, rounded
 * UP to the minor unit so the school's share (`amount × school%`, rounded
 * half-up the way `roundMoney` does) is never a cent short of the price. A 0%
 * fee (Business/Enterprise plans) or an out-of-range percentage charges the
 * price unchanged.
 */
export function chargedAmount(
  price: number,
  platformPercentage: number,
  bearer: FeeBearer,
  currency = 'usd',
): number {
  if (bearer !== 'student') return price
  if (!(price > 0)) return price
  if (!(platformPercentage > 0) || platformPercentage >= 100) return price
  return ceilMoney((price * 100) / (100 - platformPercentage), currency)
}

export interface FeeBreakdown {
  /** The listed price. */
  price: number
  /** The platform's cut of what the buyer pays. */
  platformFee: number
  /** What the buyer is charged. */
  customerPays: number
  /** What the school keeps: customerPays − platformFee. */
  schoolReceives: number
}

/**
 * The two-sided breakdown the product editor shows ("service price / platform
 * fee / customer pays / you receive"). Uses the same arithmetic as the
 * checkout routes, so the preview is the charge.
 */
export function feeBreakdown(
  price: number,
  platformPercentage: number,
  bearer: FeeBearer,
  currency = 'usd',
): FeeBreakdown {
  const customerPays = chargedAmount(price, platformPercentage, bearer, currency)
  const pct = platformPercentage > 0 && platformPercentage < 100 ? platformPercentage : platformPercentage >= 100 ? 100 : 0
  const schoolReceives = roundMoneyIn((customerPays * (100 - pct)) / 100, currency)
  const platformFee = roundMoneyIn(customerPays - schoolReceives, currency)
  return { price, platformFee, customerPays, schoolReceives }
}
