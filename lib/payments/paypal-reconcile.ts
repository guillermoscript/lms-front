/**
 * Ask PayPal what actually happened to a hosted checkout we stopped hearing
 * about (#479). Shared by the stale-checkout cron and by the checkout route,
 * which runs it on the buyer's own leftover pending row before minting a new
 * one — without that, a buyer who clicked "Cancel and return" on PayPal's page
 * hit `transactions_unique_product` / `transactions_unique_plan` and a generic
 * 500 on every retry until the 24h TTL lapsed.
 *
 * The row's `provider_checkout_id` is an Orders v2 order id for a product and a
 * Billing Subscriptions `I-…` id for a plan. They are different APIs: asking
 * the Orders API about an `I-…` id 404s, which the cron used to read as an
 * outage and so left every abandoned plan checkout pending forever.
 *
 * Outcomes:
 *   - `settled`   the payment went through and was dispatched just now
 *   - `in_flight` money is moving but not settled (approved, capture PENDING)
 *   - `dead`      nothing was, or will be, taken — safe to expire
 *   - `unknown`   PayPal could not answer — never read as abandoned
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPaymentProvider } from '@/lib/payments'
import type { PayPalPaymentProvider } from '@/lib/payments/paypal-provider'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'

export type PayPalCheckoutOutcome = 'settled' | 'in_flight' | 'dead' | 'unknown'

export interface PayPalCheckoutRow {
  transaction_id: number
  provider_checkout_id: string | null
  plan_id: number | null
}

function isNotFound(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 404
}

export async function reconcilePayPalCheckout(
  admin: SupabaseClient,
  row: PayPalCheckoutRow,
): Promise<PayPalCheckoutOutcome> {
  const checkoutId = row.provider_checkout_id
  if (!checkoutId) return 'dead'

  let paypal: PayPalPaymentProvider
  try {
    paypal = getPaymentProvider('paypal') as PayPalPaymentProvider
  } catch {
    // Not configured on this deployment — nothing to ask.
    return 'dead'
  }

  return row.plan_id
    ? reconcileSubscription(admin, paypal, row, checkoutId)
    : reconcileOrder(admin, paypal, row, checkoutId)
}

async function reconcileSubscription(
  admin: SupabaseClient,
  paypal: PayPalPaymentProvider,
  row: PayPalCheckoutRow,
  subscriptionId: string,
): Promise<PayPalCheckoutOutcome> {
  let details: Awaited<ReturnType<PayPalPaymentProvider['getSubscriptionDetails']>>
  try {
    details = await paypal.getSubscriptionDetails(subscriptionId)
  } catch (err) {
    if (isNotFound(err)) return 'dead'
    console.error(
      `[paypal-reconcile] subscription lookup failed for ${subscriptionId} (tx ${row.transaction_id}):`,
      err,
    )
    return 'unknown'
  }

  // APPROVAL_PENDING is a subscription the buyer never approved; PayPal expires
  // it on its own. CANCELLED / EXPIRED never billed through us.
  if (details.status === 'APPROVED') return 'in_flight'
  if (details.status !== 'ACTIVE' && details.status !== 'SUSPENDED') return 'dead'

  // Activated at PayPal but BILLING.SUBSCRIPTION.ACTIVATED never landed. The
  // dispatcher's owner binding still applies — the ids come from PayPal's copy
  // of the custom_id, not from our row.
  try {
    await dispatchBillingEvent(
      {
        type: 'subscription.activated',
        providerEventId: `paypal-subscription-reconcile:${subscriptionId}`,
        providerSubscriptionId: subscriptionId,
        periodEnd: details.nextBillingTime,
        reference: details.reference,
        metadata: details.metadata,
        raw: { source: 'paypal-reconcile', subscriptionId },
      },
      { provider: 'paypal', admin },
    )
    return 'settled'
  } catch (err) {
    console.error(`[paypal-reconcile] activation dispatch failed for tx ${row.transaction_id}:`, err)
    return 'unknown'
  }
}

async function reconcileOrder(
  admin: SupabaseClient,
  paypal: PayPalPaymentProvider,
  row: PayPalCheckoutRow,
  orderId: string,
): Promise<PayPalCheckoutOutcome> {
  let order: Awaited<ReturnType<PayPalPaymentProvider['getOrder']>>
  try {
    order = await paypal.getOrder(orderId)
  } catch (err) {
    if (isNotFound(err)) return 'dead'
    // A provider outage must not be read as "abandoned".
    console.error(`[paypal-reconcile] getOrder failed for order ${orderId} (tx ${row.transaction_id}):`, err)
    return 'unknown'
  }

  let capture: { captureId?: string; captureStatus?: string; reference?: string; metadata?: Record<string, string> }
  if (order.status === 'APPROVED') {
    // PayPal keeps an approved order capturable for three days, well past our
    // TTL: the buyer approved and the redirect back to us never completed.
    try {
      capture = await paypal.captureOrder(orderId)
    } catch (err) {
      console.error(`[paypal-reconcile] capture failed for order ${orderId} (tx ${row.transaction_id}):`, err)
      return 'unknown'
    }
  } else if (order.status === 'COMPLETED' && order.captureId) {
    capture = order
  } else {
    // CREATED / PAYER_ACTION_REQUIRED / VOIDED — nothing was ever taken.
    return 'dead'
  }

  if (capture.captureStatus === 'PENDING') return 'in_flight'
  if (capture.captureStatus !== 'COMPLETED' || !capture.captureId) return 'dead'

  try {
    await dispatchBillingEvent(
      {
        type: 'payment.succeeded',
        providerEventId: `paypal-capture:${capture.captureId}`,
        providerPaymentId: capture.captureId,
        reference: capture.reference,
        metadata: capture.metadata,
        raw: { source: 'paypal-reconcile', orderId },
      },
      { provider: 'paypal', admin },
    )
    return 'settled'
  } catch (err) {
    console.error(`[paypal-reconcile] dispatch failed for order ${orderId} (tx ${row.transaction_id}):`, err)
    return 'unknown'
  }
}
