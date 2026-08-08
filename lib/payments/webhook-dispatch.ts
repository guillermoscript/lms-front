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
 * canceled/expired and re-enables them on a return to active. It matches
 * neither branch for `past_due`, so recording a dunning subscription leaves
 * access untouched — which is what we want during the provider's retry window.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedBillingEvent } from './types'

/**
 * The amount a `refund.succeeded` event gave back, in major units of the
 * transaction's own currency (issue #547).
 *
 * Two fallbacks, both deliberately landing on "the whole sale" — the behaviour
 * that predates #547, so an unexpected payload degrades to the status quo
 * rather than to a silently under-recorded refund:
 *
 *   - **No amount.** The provider didn't say, so we can't claim it was partial.
 *   - **Currency disagreement.** The figure is in a different unit of account.
 *     It is discarded rather than converted: this module has no rates, and a
 *     mis-scaled number here moves real money in a payout. Provider-specific
 *     equivalences (Binance's USD-pegged stablecoins) are resolved in that
 *     provider's own mapper, so anything still mismatched here is genuine.
 */
function refundedSlice(
  event: { amount?: number; currency?: string },
  txCurrency: string | null | undefined,
  saleAmount: number,
  txnId: number,
): number {
  if (event.amount == null || !Number.isFinite(event.amount) || event.amount <= 0) return saleAmount
  const eventCurrency = event.currency?.toLowerCase()
  const rowCurrency = txCurrency?.toLowerCase()
  if (eventCurrency && rowCurrency && eventCurrency !== rowCurrency) {
    console.error(
      `[webhook] refund for transaction ${txnId} reported in ${eventCurrency} but the sale is in ${rowCurrency} — ignoring the amount and treating it as a FULL refund`,
    )
    return saleAmount
  }
  return event.amount
}

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
          // Fail CLOSED if the provider ever drops userId/tenantId from the
          // round-tripped custom data — missing metadata must not be treated as
          // "no mismatch" (that would silently re-open the same guessable-id gap).
          const meta = event.metadata ?? {}
          const ownerMismatch =
            !meta.userId || !meta.tenantId ||
            (tx?.user_id != null && meta.userId !== tx.user_id) ||
            (tx?.tenant_id != null && meta.tenantId !== tx.tenant_id)
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
              if (!event.providerEventId) {
                throw new Error(`dispatch ${event.type}: provider event id is required for period alignment`)
              }
              const { error: extErr } = await admin.rpc('apply_webhook_subscription_period', {
                _provider_event_id: event.providerEventId,
                _provider_subscription_id: subId,
                _provider: provider,
                _new_period_end: event.periodEnd.toISOString(),
                _allow_period_realign: true,
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
      if (!event.providerEventId) {
        throw new Error(`dispatch ${event.type}: provider event id is required for period extension`)
      }
      const { error } = await admin.rpc('apply_webhook_subscription_period', {
        _provider_event_id: event.providerEventId,
        _provider_subscription_id: subId,
        _provider: provider,
        _new_period_end: event.periodEnd.toISOString(),
        _allow_period_realign: false,
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

    case 'subscription.past_due': {
      // `past_due` HAS been a valid enum value since
      // 20260530140000_add_past_due_subscription_status.sql; this branch used
      // to log and drop the event on a stale "the enum has no past_due"
      // comment, so a student mid-dunning looked perfectly healthy to billing
      // health, the admin subscription list and the student's own billing page
      // (#545). Record it: access continues (the status-change trigger ignores
      // past_due) and a later renewed/canceled/expired event moves it on.
      if (!subId) break
      const { error } = await admin
        .from('subscriptions')
        .update({ subscription_status: 'past_due' })
        .eq('provider_subscription_id', subId)
        .eq('payment_provider', provider)
      if (error) throw new Error(`dispatch ${event.type} failed: ${error.message}`)
      break
    }

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
      // signed event could complete another user's/tenant's transaction. Fail
      // CLOSED if userId/tenantId are missing rather than treating a dropped
      // custom-data field as "no mismatch."
      const meta = event.metadata ?? {}
      const ownerMismatch =
        !meta.userId || !meta.tenantId ||
        (tx.user_id != null && meta.userId !== tx.user_id) ||
        (tx.tenant_id != null && meta.tenantId !== tx.tenant_id)
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
      // A refund on a completed purchase — one-time product OR subscription
      // (Lemon Squeezy `order_refunded`, PayPal `PAYMENT.CAPTURE.REFUNDED`,
      // Binance `PAY_REFUND`/`REFUND_SUCCESS`). Two separate decisions here,
      // which used to be conflated into a single product-only guard (#515):
      //
      //   1. RECORD THE MONEY, to the cent. `refunded_amount` accumulates the
      //      refunded slice for both kinds; `status` → 'refunded' only once the
      //      whole sale is back. This is what `getPayoutsOwed()` reads:
      //      `computeOwedBalances` scales (amount − refunded_amount), so the
      //      school stops being owed a share of exactly the money the platform
      //      gave back — no more, no less (#547). Skipping this for plan rows
      //      meant a refunded subscription was never clawed back on the
      //      platform-settled providers (#498 follow-up). The legacy Stripe
      //      Connect route already flips both kinds (`charge.refunded`).
      //
      //   2. REVOKE ACCESS — on a FULL refund only (#547). Products only. No trigger revokes product
      //      entitlements (trigger_manage_transactions acts on
      //      successful/failed), so it is done explicitly here. Subscription
      //      access stays owned by subscription.canceled/expired, which write
      //      `subscriptions.subscription_status` and let the DB trigger cascade.
      //
      // Flipping a plan row to 'refunded' is inert in the DB — the trigger
      // matches neither branch — and drops the row out of the partial unique
      // index transactions_unique_plan, which frees the buyer to re-subscribe
      // to that plan later. Status-guarded for idempotency on redelivery.
      if (!event.reference) break
      const txnId = Number.parseInt(event.reference, 10)
      if (Number.isNaN(txnId)) break
      if (!event.providerEventId) {
        throw new Error(`dispatch ${event.type}: provider event id is required for refund accounting`)
      }

      const { data: tx } = await admin
        .from('transactions')
        .select(
          'transaction_id, status, user_id, plan_id, product_id, amount, currency, refunded_amount',
        )
        .eq('transaction_id', txnId)
        .maybeSingle()

      if (!tx) throw new Error(`dispatch ${event.type}: transaction ${txnId} not found`)
      if (tx.status === 'pending') {
        throw new Error(`dispatch ${event.type}: transaction ${txnId} is still pending`)
      }
      if (!['successful', 'refunded'].includes(tx.status)) break
      if (!tx.product_id && !tx.plan_id) break

      // How much of the sale this refund actually gave back (#547). All three
      // platform-settled providers support partial refunds, and treating every
      // one as total removed the WHOLE sale from `grossOwed` — under-paying the
      // school for money it was still owed — and revoked course access from a
      // student who had only been refunded a slice.
      const saleAmount = Number(tx.amount ?? 0)
      const slice = refundedSlice(event, tx.currency, saleAmount, txnId)
      // Dedupe, accounting and full-refund entitlement revocation share one
      // transaction. A replay cannot revoke an entitlement reactivated by a
      // later purchase, and a crash cannot split money from access state.
      const { data, error } = await admin.rpc('apply_webhook_refund', {
        _provider: provider,
        _provider_event_id: event.providerEventId,
        _transaction_id: txnId,
        _refund_amount: slice,
      })
      if (error) throw new Error(`dispatch ${event.type} failed: ${error.message}`)
      if (!(data as { applied: boolean }[] | null)?.[0]) {
        throw new Error(`dispatch ${event.type}: refund transaction ${txnId} was not applicable`)
      }
      break
    }

    case 'payment.failed': {
      // A hosted-checkout provider can deliver a terminal failure for an
      // abandoned order (Binance Pay `PAY_CLOSED` on order expiry). The pending
      // transaction created at checkout must be cleared, or the partial unique
      // indexes transactions_unique_product / transactions_unique_plan
      // (WHERE status IN ('pending','successful')) keep blocking the buyer's
      // retry purchase forever. Flip the referenced row → failed.
      //
      // Idempotent + ordering-safe: the `.eq('status','pending')` guard means a
      // late PAY_CLOSED that races a PAY_SUCCESS (already flipped → successful)
      // is a no-op, and a redelivery finds no pending row. Providers that never
      // send a one-time payment-failed webhook (Lemon Squeezy) never reach here
      // with a reference, so this is a no-op for them.
      if (!event.reference) {
        console.log(`[webhook] payment.failed for ${provider} without reference — no-op`)
        break
      }
      const txnId = Number.parseInt(event.reference, 10)
      if (Number.isNaN(txnId)) break

      const { error } = await admin
        .from('transactions')
        .update({ status: 'failed' })
        .eq('transaction_id', txnId)
        .eq('status', 'pending')
      if (error) throw new Error(`dispatch ${event.type} failed: ${error.message}`)
      break
    }
  }
}
