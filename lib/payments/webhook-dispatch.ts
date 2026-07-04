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

    case 'payment.succeeded': {
      // One-time purchase confirmation for hosted-checkout / Merchant-of-Record
      // providers (Lemon Squeezy `order_created`). Carries our `reference` (the
      // pending transaction id) round-tripped from checkout custom data.
      //
      // LS fires `order_created` for the first charge of a SUBSCRIPTION too —
      // those are owned by `subscription.activated`, so we skip any matched
      // transaction that has a plan_id and act only on one-time products. The
      // flip → successful fires `after_transaction_update` →
      // `trigger_manage_transactions`, whose product branch runs
      // `enroll_user(user, product_id)`. Status-guarded for idempotency.
      //
      // NOTE: Stripe one-time payments do NOT route here (the Connect route
      // flips the transaction directly), so this branch only affects the
      // unified webhook route.
      if (!event.reference) break
      const txnId = Number.parseInt(event.reference, 10)
      if (Number.isNaN(txnId)) break

      const { data: tx } = await admin
        .from('transactions')
        .select('transaction_id, status, user_id, tenant_id, plan_id, product_id')
        .eq('transaction_id', txnId)
        .maybeSingle()

      // No row, or a subscription order (owned by subscription.activated).
      if (!tx || tx.plan_id) break

      // Owner-binding guard (M1): the signed event proves it came from the
      // provider store, but `reference` is a sequential id — without this a
      // signed event could complete another user's/tenant's transaction.
      const meta = event.metadata ?? {}
      const ownerMismatch =
        (meta.userId && tx.user_id && meta.userId !== tx.user_id) ||
        (meta.tenantId && tx.tenant_id && meta.tenantId !== tx.tenant_id)
      if (ownerMismatch) {
        throw new Error(
          `dispatch ${event.type}: metadata owner mismatch for transaction ${txnId} — refusing to activate`,
        )
      }

      if (tx.status === 'pending') {
        const { error } = await admin
          .from('transactions')
          .update({ status: 'successful', payment_provider: provider })
          .eq('transaction_id', txnId)
          .eq('status', 'pending')
        if (error) throw new Error(`dispatch ${event.type} activation failed: ${error.message}`)
        // after_transaction_update trigger → enroll_user(user, product_id).
      }
      break
    }

    case 'refund.succeeded': {
      // One-time order refund (Lemon Squeezy `order_refunded`). Mirrors the
      // Stripe Connect route's charge.refunded product path: flip → refunded and
      // EXPLICITLY revoke the product entitlements — no trigger does this for
      // products (trigger_manage_transactions only acts on successful/failed).
      // Subscription refunds are owned by subscription.canceled/expired, so skip
      // when plan_id is set. Status-guarded for idempotency.
      if (!event.reference) break
      const txnId = Number.parseInt(event.reference, 10)
      if (Number.isNaN(txnId)) break

      const { data: tx } = await admin
        .from('transactions')
        .select('transaction_id, status, user_id, plan_id, product_id')
        .eq('transaction_id', txnId)
        .maybeSingle()

      // Only act on a completed one-time product purchase.
      if (!tx || tx.plan_id || !tx.product_id || tx.status !== 'successful') break

      const { error: refErr } = await admin
        .from('transactions')
        .update({ status: 'refunded' })
        .eq('transaction_id', txnId)
        .eq('status', 'successful')
      if (refErr) throw new Error(`dispatch ${event.type} failed: ${refErr.message}`)

      const { error: entErr } = await admin
        .from('entitlements')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('user_id', tx.user_id)
        .eq('source_type', 'product')
        .eq('source_id', tx.product_id)
      if (entErr) throw new Error(`dispatch ${event.type} entitlement revoke failed: ${entErr.message}`)
      break
    }

    case 'payment.failed':
      // No transaction state change — the pending row is rolled back by the
      // checkout route on creation failure, and LS does not deliver a one-time
      // payment-failed webhook for hosted checkout. Logged for completeness.
      console.log(`[webhook] payment.failed for ${provider} — no-op in shared dispatcher`)
      break
  }
}
