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
      if (!subId) break
      // Set 'active' (not 'renewed') so the enrollment-reactivation branch of
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
