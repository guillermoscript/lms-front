/**
 * Ask Stripe what became of a Stripe Elements checkout (#754). Shared by the
 * card checkout route, which runs it on the buyer's own leftover pending row
 * before minting a new one, and by the stale-checkout cron.
 *
 * `/api/stripe/create-payment-intent` inserts the `pending` transaction BEFORE
 * the buyer sees the card form. A buyer who closes the tab leaves that row
 * inside transactions_unique_product / transactions_unique_plan, and Stripe
 * sends nothing — `payment_intent.payment_failed` only fires once a card was
 * actually tried. Every retry used to die on the insert with a 500.
 *
 * The row points at one Stripe object: the PaymentIntent
 * (`stripe_payment_intent_id`) for a one-time charge, or the
 * `default_incomplete` subscription (`provider_subscription_id`) for a plan
 * with a recurring price.
 *
 * Outcomes:
 *   - `payable`   nothing was charged and the buyer can still pay it
 *   - `in_flight` money moved or is moving; the webhook has not settled the row
 *   - `dead`      canceled / expired at Stripe — nothing was or will be taken
 *   - `unknown`   Stripe could not answer — never read as abandoned
 */

import type Stripe from 'stripe'

export type StripeCheckoutState =
  | {
      outcome: 'payable'
      clientSecret: string
      /** Minor units, as Stripe reports them. */
      amount: number | null
      currency: string | null
      /** Recurring price id for a subscription checkout; null for a PaymentIntent. */
      priceId: string | null
      destination: string | null
      /** `application_fee_amount` (minor units) for a PaymentIntent, `application_fee_percent` for a subscription. */
      applicationFee: number
    }
  | { outcome: 'in_flight' | 'dead' | 'unknown' }

export interface StripeCheckoutRow {
  transaction_id: number
  stripe_payment_intent_id: string | null
  provider_subscription_id: string | null
  transaction_date: string
}

/**
 * A pending row with no Stripe object yet is normally a crash between the
 * insert and the Stripe call — but for a moment it is also a concurrent request
 * (a double-click) that is still creating one. Cancelling that row would orphan
 * a payment the buyer is about to make.
 */
export const OBJECTLESS_GRACE_MS = 2 * 60_000

function isMissing(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string } | null
  return e?.statusCode === 404 || e?.code === 'resource_missing'
}

function accountId(destination: string | { id: string } | null | undefined): string | null {
  if (!destination) return null
  return typeof destination === 'string' ? destination : destination.id
}

export async function inspectStripeCheckout(
  stripe: Stripe,
  row: StripeCheckoutRow,
  now: Date = new Date(),
): Promise<StripeCheckoutState> {
  try {
    if (row.provider_subscription_id) return await inspectSubscription(stripe, row.provider_subscription_id)
    if (row.stripe_payment_intent_id) return await inspectPaymentIntent(stripe, row.stripe_payment_intent_id)
  } catch (err) {
    if (isMissing(err)) return { outcome: 'dead' }
    console.error(`[stripe-reconcile] lookup failed for tx ${row.transaction_id}:`, err)
    return { outcome: 'unknown' }
  }

  const age = now.getTime() - Date.parse(row.transaction_date)
  return age < OBJECTLESS_GRACE_MS ? { outcome: 'in_flight' } : { outcome: 'dead' }
}

async function inspectPaymentIntent(stripe: Stripe, id: string): Promise<StripeCheckoutState> {
  const pi = await stripe.paymentIntents.retrieve(id)
  switch (pi.status) {
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
      if (!pi.client_secret) return { outcome: 'unknown' }
      return {
        outcome: 'payable',
        clientSecret: pi.client_secret,
        amount: pi.amount,
        currency: pi.currency,
        priceId: null,
        destination: accountId(pi.transfer_data?.destination),
        applicationFee: pi.application_fee_amount ?? 0,
      }
    case 'canceled':
      return { outcome: 'dead' }
    default:
      // processing / requires_capture / succeeded
      return { outcome: 'in_flight' }
  }
}

async function inspectSubscription(stripe: Stripe, id: string): Promise<StripeCheckoutState> {
  const sub = await stripe.subscriptions.retrieve(id, { expand: ['latest_invoice.confirmation_secret'] })
  if (sub.status === 'incomplete_expired' || sub.status === 'canceled') return { outcome: 'dead' }
  if (sub.status !== 'incomplete') return { outcome: 'in_flight' }

  // latest_invoice is expanded; cast across API-version type differences.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoice = sub.latest_invoice as any
  if (invoice?.status === 'paid') return { outcome: 'in_flight' }
  const clientSecret: string | undefined = invoice?.confirmation_secret?.client_secret
  if (!clientSecret) return { outcome: 'unknown' }

  return {
    outcome: 'payable',
    clientSecret,
    amount: invoice.amount_due ?? null,
    currency: invoice.currency ?? null,
    priceId: sub.items.data[0]?.price?.id ?? null,
    destination: accountId(sub.transfer_data?.destination),
    applicationFee: sub.application_fee_percent ?? 0,
  }
}

/**
 * Whether a payable leftover charges exactly what a fresh checkout would.
 * Reusing one after the price, the school's connected account or the platform
 * fee changed would bill the old terms, so any drift means "replace it".
 */
export function stripeCheckoutMatches(
  state: Extract<StripeCheckoutState, { outcome: 'payable' }>,
  expected:
    | { kind: 'subscription'; priceId: string; destination: string; applicationFeePercent: number }
    | { kind: 'payment_intent'; amount: number; currency: string; destination: string; applicationFeeAmount: number },
): boolean {
  if (state.destination !== expected.destination) return false
  if (expected.kind === 'subscription') {
    return state.priceId === expected.priceId && state.applicationFee === expected.applicationFeePercent
  }
  return (
    state.priceId === null &&
    state.amount === expected.amount &&
    state.currency?.toLowerCase() === expected.currency.toLowerCase() &&
    state.applicationFee === expected.applicationFeeAmount
  )
}

/**
 * Cancel the checkout at Stripe so a stale tab can no longer pay it. True only
 * when the object is now uncharged for good; a PaymentIntent the buyer confirmed
 * a moment ago cannot be canceled and reports false.
 */
export async function releaseStripeCheckout(stripe: Stripe, row: StripeCheckoutRow): Promise<boolean> {
  try {
    if (row.provider_subscription_id) {
      await stripe.subscriptions.cancel(row.provider_subscription_id)
    } else if (row.stripe_payment_intent_id) {
      await stripe.paymentIntents.cancel(row.stripe_payment_intent_id)
    }
    return true
  } catch (err) {
    if (isMissing(err)) return true
    // Already canceled, or paid in the meantime — re-read to tell which.
    return (await inspectStripeCheckout(stripe, row)).outcome === 'dead'
  }
}

/**
 * The cron's view: a checkout nobody came back to. A payable one is released at
 * Stripe first, so only an object that can no longer be charged is `dead`.
 */
export async function abandonStripeCheckout(
  stripe: Stripe,
  row: StripeCheckoutRow,
): Promise<'dead' | 'in_flight' | 'unknown'> {
  const state = await inspectStripeCheckout(stripe, row)
  if (state.outcome !== 'payable') return state.outcome
  return (await releaseStripeCheckout(stripe, row)) ? 'dead' : 'unknown'
}
