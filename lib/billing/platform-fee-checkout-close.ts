/**
 * Close a platform-fee pay-now checkout AT THE PROVIDER before its
 * `platform_fee_payments` row is cancelled (#951).
 *
 * `settle_platform_fee_payment()` only credits a `pending` row: a provider
 * success that lands on a cancelled one is flagged (`review_reason`) and NOT
 * credited. So a row is never cancelled while its checkout can still take
 * money — the two callers ask here first:
 *   - the stale sweep in `/api/cron/expire-stale-checkouts` (TTL lapsed)
 *   - the supersede guard in `POST /api/billing/fees/checkout` (a new attempt
 *     replaces the previous one on the same rail)
 *
 * Both hand over only rows that are NOT the money row of a
 * `platform_payment_requests` row: a request's own lifecycle closes that one
 * (`after_fee_request_closed`), and nothing here looks the request up again.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { getPlatformBillingProvider, PLATFORM_WEBHOOK_PROVIDERS } from '@/lib/billing/platform-billing'
import { handlePlatformFeeEvent, isPlatformFeePaymentEvent } from '@/lib/billing/platform-fee-settlement'
import type { PayPalPaymentProvider } from '@/lib/payments/paypal-provider'
import type { NormalizedBillingEvent, PaymentProvider } from '@/lib/payments/types'

export interface FeeCheckoutRow {
  payment_id: string
  tenant_id: string
  provider: string
  /** Stripe Checkout Session id, PayPal order id, Binance prepayId; null when no checkout was ever opened. */
  provider_reference: string | null
  amount: number
  currency: string
}

/**
 * - `closed`: the provider confirmed this checkout can no longer take money
 *   (expired or voided here, already dead, or never opened). Safe to cancel.
 * - `paid`: money was taken or is in motion (complete / captured / approved and
 *   capturable). NEVER cancel; the row was settled here or its webhook will.
 * - `unsupported`: the rail has no way to ask or close. The caller's own rule
 *   decides (both cancel: a late success is flagged for review, never lost).
 * - `unknown`: the provider did not answer. Not an abandonment; try again later.
 */
export type FeeCheckoutCloseOutcome = 'closed' | 'paid' | 'unsupported' | 'unknown'

type CheckoutCloser = (
  admin: SupabaseClient,
  row: FeeCheckoutRow,
  reference: string,
) => Promise<FeeCheckoutCloseOutcome>

/**
 * Rails whose checkout can be asked about and closed. Named, not a capability,
 * for the reason `isExpirableCheckoutProvider` names Stripe: each entry talks
 * to that one provider's API. Binance Pay is absent on purpose — its close /
 * query calls are unconfirmed and it has no loopback seam to test them against
 * yet (#952) — so it answers `unsupported` like every rail not listed.
 */
const CHECKOUT_CLOSERS: Partial<Record<string, CheckoutCloser>> = {
  stripe: closeStripeCheckout,
  paypal: closePayPalCheckout,
}

export async function closeFeeCheckoutAtProvider(
  admin: SupabaseClient,
  row: FeeCheckoutRow,
): Promise<FeeCheckoutCloseOutcome> {
  try {
    // No checkout was ever opened (a crash between the insert and the provider
    // call), so there is nothing anyone can pay.
    if (!row.provider_reference) return 'closed'

    const closer = CHECKOUT_CLOSERS[row.provider]
    if (closer) return await closer(admin, row, row.provider_reference)

    // A rail with no platform webhook endpoint (Solana Pay, manual) settles a
    // fee row only through its `platform_payment_requests` row: the QR's
    // `/api/billing/solana/tx` and `/verify` both start from that row and 404
    // without it, and `confirm_platform_fee_request()` takes a request id. A
    // row that reaches here has none, so no path is left that could credit it.
    if (!PLATFORM_WEBHOOK_PROVIDERS.includes(row.provider as PaymentProvider)) return 'closed'

    return 'unsupported'
  } catch (err) {
    console.error(`[platform-fee-close] ${row.provider} payment ${row.payment_id} failed:`, errorMessage(err))
    return 'unknown'
  }
}

/** Never the error object itself: a provider error can carry request headers. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Stripe's `resource_missing` and PayPal's 404: the provider has no such checkout. */
function isMissing(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; code?: string } | null
  return e?.statusCode === 404 || e?.status === 404 || e?.code === 'resource_missing'
}

/**
 * The provider's own copy of the correlation our checkout set must name THIS
 * row. A reference pointing at another payment's checkout answers nothing
 * about this one, and expiring or crediting it would act on that other payment.
 */
function ownsCheckout(metadata: Record<string, string> | null | undefined, row: FeeCheckoutRow): boolean {
  return metadata?.payment_id === row.payment_id && metadata?.tenant_id === row.tenant_id
}

/**
 * Credit a checkout the provider reports as paid, through the same function
 * the platform webhook uses (`settle_platform_fee_payment`: idempotent on the
 * row and on `(provider, provider_charge_id)`, a mismatch is flagged and never
 * credited). The webhook may still arrive; it then reads `duplicate`.
 *
 * Never throws: the caller answers `paid` either way and the row stays pending
 * for the webhook or the next pass.
 */
async function settlePaidCheckout(
  admin: SupabaseClient,
  row: FeeCheckoutRow,
  event: NormalizedBillingEvent | null | undefined,
): Promise<void> {
  if (!event || !isPlatformFeePaymentEvent(event) || !ownsCheckout(event.metadata, row)) return
  try {
    const result = await handlePlatformFeeEvent(event, { provider: row.provider, admin })
    if (result.handled && result.action === 'settle' && result.outcome === 'settled') {
      console.log(`[platform-fee-close] ${row.provider} payment ${row.payment_id} was paid; credited without its webhook`)
    }
  } catch (err) {
    console.error(`[platform-fee-close] settling ${row.provider} payment ${row.payment_id} failed:`, errorMessage(err))
  }
}

/**
 * Stripe: the reference is the hosted Checkout Session (`mode: payment`) on the
 * platform account — `getStripe()` holds the same `STRIPE_SECRET_KEY` the
 * session was created with.
 */
async function closeStripeCheckout(
  admin: SupabaseClient,
  row: FeeCheckoutRow,
  sessionId: string,
): Promise<FeeCheckoutCloseOutcome> {
  const stripe = getStripe()

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch (err) {
    if (isMissing(err)) return 'closed'
    console.error(`[platform-fee-close] stripe session lookup failed for payment ${row.payment_id}:`, errorMessage(err))
    return 'unknown'
  }
  if (!ownsCheckout(session.metadata, row)) {
    console.error(`[platform-fee-close] stripe session ${sessionId} does not belong to payment ${row.payment_id}`)
    return 'unknown'
  }

  if (session.status === 'open') {
    // Still payable: expire it so a tab left open cannot pay a row we are
    // about to cancel.
    try {
      session = await stripe.checkout.sessions.expire(sessionId)
    } catch (err) {
      if (isMissing(err)) return 'closed'
      // Completed or lapsed between the two calls — re-read to tell which.
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId)
      } catch (readErr) {
        console.error(`[platform-fee-close] stripe session re-read failed for payment ${row.payment_id}:`, errorMessage(readErr))
        return 'unknown'
      }
    }
  }

  if (session.status === 'expired') return 'closed'
  if (session.status !== 'complete') return 'unknown'

  if (session.payment_status === 'paid') {
    // The provider's own mapper builds the event from the same Checkout Session
    // resource a `checkout.session.completed` delivery carries, so the charge
    // id (the PaymentIntent), the amount in major units and the currency are
    // what the webhook would have reported, not a second spelling of them.
    try {
      const event = await getPlatformBillingProvider('stripe').normalizeWebhookEvent?.(
        JSON.stringify({
          id: `platform-fee-close:${session.id}`,
          type: 'checkout.session.completed',
          data: { object: session },
        }),
      )
      await settlePaidCheckout(admin, row, event)
    } catch (err) {
      console.error(`[platform-fee-close] stripe payment ${row.payment_id} is paid but could not be mapped:`, errorMessage(err))
    }
    return 'paid'
  }

  if (session.payment_status === 'unpaid') {
    // A delayed method (bank debit, voucher). The session is spent — it cannot
    // be paid again — so the PaymentIntent says whether money is still coming.
    return closeDelayedStripePayment(stripe, row, session.payment_intent)
  }

  return 'paid'
}

async function closeDelayedStripePayment(
  stripe: Stripe,
  row: FeeCheckoutRow,
  paymentIntent: string | Stripe.PaymentIntent | null,
): Promise<FeeCheckoutCloseOutcome> {
  const intentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id
  if (!intentId) return 'paid'

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.retrieve(intentId)
  } catch (err) {
    console.error(`[platform-fee-close] stripe payment lookup failed for payment ${row.payment_id}:`, errorMessage(err))
    return 'unknown'
  }

  if (intent.status === 'canceled') return 'closed'
  // processing / requires_action (a voucher not paid yet) / succeeded: money is
  // moving or still can; `checkout.session.async_payment_succeeded` settles it.
  if (intent.status !== 'requires_payment_method') return 'paid'

  // The delayed payment FAILED and the intent fell back to waiting for a new
  // method. Cancel it, so nothing can confirm it again after the row is gone.
  try {
    await stripe.paymentIntents.cancel(intentId)
    return 'closed'
  } catch (err) {
    console.error(`[platform-fee-close] stripe payment cancel failed for payment ${row.payment_id}:`, errorMessage(err))
    return 'unknown'
  }
}

/**
 * PayPal: the reference is the Orders v2 order. Orders v2 never captures on
 * its own — money moves only through `/api/billing/fees/paypal/capture`, which
 * refuses a row that is no longer pending — so an order with no capture cannot
 * take money once its row is cancelled, whatever its status (CREATED, APPROVED,
 * VOIDED). PayPal has no call that voids a CAPTURE-intent order, and none is
 * needed for that reason.
 */
async function closePayPalCheckout(
  admin: SupabaseClient,
  row: FeeCheckoutRow,
  orderId: string,
): Promise<FeeCheckoutCloseOutcome> {
  const paypal = getPlatformBillingProvider('paypal') as PayPalPaymentProvider

  let order: Awaited<ReturnType<PayPalPaymentProvider['getOrder']>>
  try {
    order = await paypal.getOrder(orderId)
  } catch (err) {
    if (isMissing(err)) return 'closed'
    // A provider outage must not be read as "abandoned".
    console.error(`[platform-fee-close] paypal order lookup failed for payment ${row.payment_id}:`, errorMessage(err))
    return 'unknown'
  }
  if (!ownsCheckout(order.metadata, row)) {
    console.error(`[platform-fee-close] paypal order ${orderId} does not belong to payment ${row.payment_id}`)
    return 'unknown'
  }

  if (!order.captureId) return 'closed'

  // A capture exists: money was taken or is being reviewed (PENDING), and the
  // PAYMENT.CAPTURE.* webhooks own every state but COMPLETED. For COMPLETED,
  // this is the event the capture route dispatches — the capture id, amount and
  // currency `getOrder` reads off the capture are the ones
  // PAYMENT.CAPTURE.COMPLETED reports for it.
  if (order.captureStatus === 'COMPLETED') {
    await settlePaidCheckout(admin, row, {
      type: 'payment.succeeded',
      providerEventId: `platform-paypal-capture:${order.captureId}`,
      providerPaymentId: order.captureId,
      reference: order.reference,
      metadata: order.metadata,
      amount: order.amount,
      currency: order.currency,
      raw: { source: 'platform-fee-close', orderId, captureId: order.captureId },
    })
  }
  return 'paid'
}
