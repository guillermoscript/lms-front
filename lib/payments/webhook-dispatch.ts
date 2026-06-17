/**
 * Shared billing-event dispatcher.
 *
 * Single source of truth for applying a NormalizedBillingEvent to our
 * subscription state. BOTH the unified `/api/payments/webhook/[provider]` route
 * (new providers) and the legacy `/api/stripe/webhook` route call this, so the
 * subscription lifecycle logic lives in ONE place.
 *
 * Subscriptions are matched by (provider_subscription_id, payment_provider).
 * Writing `subscription_status` fires the DB trigger
 * `handle_subscription_status_change`, which disables linked enrollments on
 * canceled/expired and re-enables them on a return to active.
 *
 * IMPORTANT: the `subscription_status` enum is
 * ('active','canceled','expired','renewed') — there is NO 'past_due'. past_due
 * events are logged only (access continues during the provider's retry window)
 * rather than written to an invalid enum value.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedBillingEvent } from './types'

export interface DispatchContext {
  /** Provider slug — used as the payment_provider match key. */
  provider: string
  /** Service-role Supabase client (bypasses RLS). */
  admin: SupabaseClient
}

export async function dispatchBillingEvent(
  event: NormalizedBillingEvent,
  { provider, admin }: DispatchContext
): Promise<void> {
  const subId = event.providerSubscriptionId

  switch (event.type) {
    case 'subscription.activated': {
      // First activation for hosted-checkout / Merchant-of-Record providers
      // (Lemon Squeezy): NO subscription row exists yet. Unlike Stripe — whose
      // first payment is confirmed client-side and activated by the legacy
      // route's invoice.payment_succeeded — these providers confirm payment via
      // THIS webhook, carrying our `reference` (the pending transaction id)
      // round-tripped from checkout custom data. Flip that pending transaction
      // → successful: the after_transaction_update trigger
      // (trigger_manage_transactions → handle_new_subscription) CREATES the
      // subscription row + entitlements, copying payment_provider +
      // provider_subscription_id off the transaction. Then align the period to
      // the provider's authoritative period end (LS renews_at). Idempotent:
      // status='pending' guard means a redelivery (or a later non-create event)
      // falls through to the existing-row update below.
      if (event.reference && subId) {
        const txnId = Number.parseInt(event.reference, 10)
        if (!Number.isNaN(txnId)) {
          const { data: tx } = await admin
            .from('transactions')
            .select('transaction_id, status, user_id, tenant_id')
            .eq('transaction_id', txnId)
            .maybeSingle()

          // Bind the flip to the checkout's own metadata (M1): the signed event
          // proves it came from the provider store, but `reference` is a
          // sequential id — without this check a signed event could activate
          // another user's/tenant's pending transaction by guessing its id.
          const meta = event.metadata ?? {}
          const ownerMismatch =
            (meta.userId && tx?.user_id && meta.userId !== tx.user_id) ||
            (meta.tenantId && tx?.tenant_id && meta.tenantId !== tx.tenant_id)
          if (ownerMismatch) {
            throw new Error(
              `dispatch ${event.type}: metadata owner mismatch for transaction ${txnId} — refusing to activate`,
            )
          }

          if (tx?.status === 'pending') {
            const { error: flipErr } = await admin
              .from('transactions')
              .update({
                status: 'successful',
                provider_subscription_id: subId,
                payment_provider: provider,
              })
              .eq('transaction_id', txnId)
              .eq('status', 'pending')
            if (flipErr) throw new Error(`dispatch ${event.type} activation failed: ${flipErr.message}`)

            // handle_new_subscription set end_date from the plan duration; the
            // provider's schedule is authoritative, so align to renews_at.
            if (event.periodEnd) {
              const { error: extErr } = await admin.rpc('extend_subscription_period', {
                _provider_subscription_id: subId,
                _provider: provider,
                _new_period_end: event.periodEnd.toISOString(),
              })
              if (extErr) throw new Error(`dispatch ${event.type} period-align failed: ${extErr.message}`)
            }
            break
          }
        }
      }

      if (!subId) break
      // Existing row (return-from-expired reactivation). Set 'active' (not
      // 'renewed') so the enrollment-reactivation branch of
      // handle_subscription_status_change fires on a return from expired.
      const patch: Record<string, unknown> = { subscription_status: 'active' }
      if (event.periodEnd) patch.current_period_end = event.periodEnd.toISOString()
      const { error } = await admin
        .from('subscriptions')
        .update(patch)
        .eq('provider_subscription_id', subId)
        .eq('payment_provider', provider)
      if (error) throw new Error(`dispatch ${event.type} failed: ${error.message}`)
      break
    }

    case 'subscription.renewed': {
      if (!subId) break
      // A renewal must EXTEND the access window — not just touch a status. The
      // partial unique index transactions_unique_plan blocks fabricating a new
      // successful transaction, so extend the subscription + its entitlements
      // atomically via the RPC (end_date, current_period_end, expires_at).
      if (!event.periodEnd) {
        console.warn(`[webhook] renewed for ${provider} sub ${subId} without periodEnd — cannot extend access`)
        break
      }
      const { error } = await admin.rpc('extend_subscription_period', {
        _provider_subscription_id: subId,
        _provider: provider,
        _new_period_end: event.periodEnd.toISOString(),
      })
      if (error) throw new Error(`dispatch ${event.type} failed: ${error.message}`)
      break
    }

    case 'subscription.canceled':
    case 'subscription.expired': {
      if (!subId) break
      const status = event.type === 'subscription.canceled' ? 'canceled' : 'expired'
      const { error } = await admin
        .from('subscriptions')
        .update({ subscription_status: status, ended_at: new Date().toISOString() })
        .eq('provider_subscription_id', subId)
        .eq('payment_provider', provider)
      if (error) throw new Error(`dispatch ${event.type} failed: ${error.message}`)
      break
    }

    case 'subscription.past_due':
      // No 'past_due' enum value; log only. Access continues during the
      // provider's retry window — a later canceled/expired event ends it.
      console.log(`[webhook] past_due for ${provider} sub ${subId ?? 'unknown'} — no status change`)
      break

    case 'payment.succeeded':
    case 'payment.failed':
    case 'refund.succeeded':
      // Transaction-level events stay with provider-specific routes (e.g. the
      // Stripe Connect route's payment_intent / charge.refunded handlers, which
      // own the transactions state machine, emails and entitlement revocation).
      // Logged here so the unified path is explicit about what it does NOT own.
      console.log(`[webhook] ${event.type} for ${provider} — no-op in shared dispatcher`)
      break
  }
}
