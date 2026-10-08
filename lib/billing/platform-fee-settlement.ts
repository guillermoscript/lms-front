/**
 * Platform fee settlement branch of the school → platform webhook loop (#929,
 * design 2.4). `dispatchPlatformBillingEvent` hands every event here FIRST;
 * this module claims the ones that belong to the fee ledger and leaves the
 * rest to the plan-subscription logic.
 *
 *  - `payment.succeeded` carrying `metadata.kind = 'platform_fee'` (our own
 *    pay-now Checkout Session) → `settle_platform_fee_payment()`: credits the
 *    pending `platform_fee_payments` row named in the metadata, idempotent on
 *    the row and on `(provider, provider_charge_id)`, and re-evaluates the
 *    tenant's standing in the SAME transaction so a paid school is unblocked
 *    immediately. An amount/currency mismatch is flagged for review and never
 *    credited (R7) — unlike student refunds, it does not fall back to "full".
 *  - `refund.succeeded` / `payment.disputed` whose payment id matches a
 *    credited fee payment → `reverse_platform_fee_payment_by_charge()`: the
 *    row becomes `reversed` (append-only ledger, no negative rows) and the
 *    balance is owed again. Provider refund amounts are not modelled: any
 *    refund of a fee payment reverses the whole credit; a super admin records
 *    a kept remainder as an offline payment.
 *
 * Every write is a SECURITY DEFINER SQL function (service role only): the
 * money tables are server-write-only.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedBillingEvent } from '@/lib/payments/types'

export const PLATFORM_FEE_METADATA_KIND = 'platform_fee'

export type FeeSettleOutcome = 'settled' | 'duplicate' | 'mismatch' | 'not_pending' | 'not_found'
export type FeeReverseOutcome = 'reversed' | 'duplicate' | 'not_settled' | 'not_found'

export type FeeEventResult =
  | { handled: false }
  | { handled: true; action: 'settle'; outcome: FeeSettleOutcome; paymentId: string }
  | { handled: true; action: 'reverse'; outcome: FeeReverseOutcome }

/** A pay-now settlement event: only ours, by the metadata our checkout set. */
export function isPlatformFeePaymentEvent(event: NormalizedBillingEvent): boolean {
  return event.type === 'payment.succeeded' && event.metadata?.kind === PLATFORM_FEE_METADATA_KIND
}

export async function handlePlatformFeeEvent(
  event: NormalizedBillingEvent,
  ctx: { provider: string; admin: SupabaseClient },
): Promise<FeeEventResult> {
  const { provider, admin } = ctx

  if (isPlatformFeePaymentEvent(event)) {
    const paymentId = event.metadata?.payment_id || event.reference
    const tenantId = event.metadata?.tenant_id
    if (!paymentId || !tenantId) {
      // Ours by kind but unusable: ack (a 500 would redeliver forever) and say so.
      console.error(`[platform-fee] ${provider} fee event ${event.providerEventId} lacks payment_id/tenant_id — not credited`)
      return { handled: true, action: 'settle', outcome: 'not_found', paymentId: paymentId ?? '' }
    }
    const { data, error } = await admin.rpc('settle_platform_fee_payment', {
      _payment_id: paymentId,
      _tenant_id: tenantId,
      _provider: provider,
      _provider_charge_id: event.providerPaymentId ?? null,
      _amount: typeof event.amount === 'number' && Number.isFinite(event.amount) ? event.amount : null,
      _currency: event.currency ?? null,
    })
    // Throw so the webhook route records the failure and the provider retries.
    if (error) throw new Error(`settle_platform_fee_payment failed: ${error.message}`)
    const outcome = String(data) as FeeSettleOutcome
    if (outcome !== 'settled' && outcome !== 'duplicate') {
      console.error(`[platform-fee] ${provider} payment ${paymentId} not credited: ${outcome}`)
    }
    return { handled: true, action: 'settle', outcome, paymentId }
  }

  if ((event.type === 'refund.succeeded' || event.type === 'payment.disputed') && event.providerPaymentId) {
    const { data, error } = await admin.rpc('reverse_platform_fee_payment_by_charge', {
      _provider: provider,
      _provider_charge_id: event.providerPaymentId,
      _reason: event.type === 'payment.disputed' ? 'chargeback' : 'refund',
    })
    if (error) throw new Error(`reverse_platform_fee_payment_by_charge failed: ${error.message}`)
    const outcome = String(data) as FeeReverseOutcome
    // Not a fee payment: not ours, let the caller decide (it drops it).
    if (outcome === 'not_found') return { handled: false }
    return { handled: true, action: 'reverse', outcome }
  }

  return { handled: false }
}
