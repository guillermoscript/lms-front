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
import { PROVIDER_CAPABILITIES, type PaymentProvider } from './types'
import { netOfRefunds } from './payouts-owed'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track, safeAnalytics } from '@/lib/analytics/server'

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

// ---------------------------------------------------------------------------
// Loop C analytics.
//
// WHY HERE AND NOT IN THE ROUTES: two callers dispatch the SAME
// `payment.succeeded` for one PayPal capture — `app/api/payments/paypal/capture`
// on the buyer's return and `app/api/payments/webhook/paypal` on the provider's
// webhook — and only one of them wins the `.eq('status','pending')` guard below.
// That guard IS the correctness boundary for "did this delivery settle the
// sale", so an event fired above it would double-count every PayPal (and
// Binance) purchase. Emitting from inside the guarded branches makes one
// settled sale produce exactly one event, whichever caller got there first.
//
// EVERY CALL IS FIRE-AND-FORGET (`void`). `track()` cannot throw and is
// deadline-capped, but the settlement path must not wait on it at all — a
// webhook that answers slowly gets retried, and a retried payment webhook is a
// far worse outcome than a missing chart point. This deployment runs a
// long-lived Node process (not a freezing serverless invocation), so a floating
// promise here does complete.
//
// DELIBERATELY NOT INSTRUMENTED: `subscription.renewed`. The legacy Stripe route
// emits its own renewal event (it already reads the subscription row for
// attribution and out-of-order detection), and adding one here would double it.
// ---------------------------------------------------------------------------

/** The transaction row the money events are derived from. */
interface SettlementRow {
  transaction_id: number
  user_id: string | null
  tenant_id?: string | null
  amount: number | null
  currency: string | null
  refunded_amount?: number | null
  school_percentage_snapshot?: number | null
  plan_id: number | null
  product_id?: number | null
}

/**
 * The platform's cut, for analytics only.
 *
 * WHETHER a fee is taken is the provider's `bearsPlatformFee` capability —
 * never `revenue_splits.applies_to_providers`, retired in #547 because it held
 * the labels `stripe`/`manual` rather than provider slugs, which reported 0% on
 * every PayPal/LS/Binance sale while `getPayoutsOwed` applied the full split.
 * The RATE is the transaction's OWN `school_percentage_snapshot`, so this figure
 * and the payout reconcile row by row.
 *
 * Omits the property entirely rather than guessing when the row has no
 * snapshot; the companion `school_percentage_snapshot: null` says why.
 */
function platformFeeProps(
  provider: string,
  netAmount: number,
  snapshot: number | null | undefined,
): { platform_fee: number } | Record<string, never> {
  if (!PROVIDER_CAPABILITIES[provider as PaymentProvider]?.bearsPlatformFee) {
    return { platform_fee: 0 }
  }
  if (snapshot == null) return {}
  return { platform_fee: Math.round(netAmount * (100 - Number(snapshot))) / 100 }
}

/**
 * `payment_succeeded` + `entitlement_granted` for a transaction that just
 * flipped to successful. Callers `void` this.
 *
 * The entitlement count is read rather than assumed: the
 * `after_transaction_update` trigger creates those rows in the same statement,
 * so a zero here is a real paid-but-no-access incident — the one number that
 * makes the event worth emitting at all.
 *
 * Wrapped whole: that `entitlements` read is pure analytics, and callers `void`
 * this — so an unguarded throw would not fail the webhook, it would surface as
 * an unhandled promise rejection instead. Losing the event is the right failure.
 */
async function trackSettlement(
  admin: SupabaseClient,
  provider: string,
  tx: SettlementRow,
  extra: Record<string, unknown> = {},
): Promise<void> {
  return safeAnalytics(async () => {
    const ctx = { userId: tx.user_id, tenantId: tx.tenant_id ?? null }
    const gross = Number(tx.amount ?? 0)
    // NET of refunds (#547): a partial refund leaves the row 'successful', so a
    // gross sum would overstate revenue exactly the way the school-facing screens
    // did before that issue. Normally a no-op on a fresh flip — it is here so the
    // property is net by construction rather than by luck.
    const net = netOfRefunds(gross, tx.refunded_amount)
    const snapshot = tx.school_percentage_snapshot ?? null

    await track(
      ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
      {
        provider,
        amount_major: net,
        currency: tx.currency ?? 'usd',
        is_subscription: !!tx.plan_id,
        ...platformFeeProps(provider, net, snapshot),
        school_percentage_snapshot: snapshot,
        gross_amount: gross,
        transaction_id: tx.transaction_id,
        ...(tx.plan_id ? { plan_id: tx.plan_id } : {}),
        ...(tx.product_id ? { product_id: tx.product_id } : {}),
        ...extra,
      },
      ctx,
    )

    const sourceType = tx.plan_id ? 'subscription' : 'product'
    const sourceId = tx.plan_id ?? tx.product_id
    if (!tx.user_id || sourceId == null) return

    const { count } = await admin
      .from('entitlements')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', tx.user_id)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('status', 'active')

    await track(
      ANALYTICS_EVENTS.ENTITLEMENT_GRANTED,
      {
        source_type: sourceType,
        course_count: count ?? 0,
        provider,
        transaction_id: tx.transaction_id,
      },
      ctx,
    )
  }, 'payment settlement analytics')
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
          // The money columns are for the settlement event below — extra
          // columns on a read that was already happening, not a second query.
          const { data: tx } = await admin
            .from('transactions')
            .select(
              'transaction_id, status, user_id, tenant_id, amount, currency, refunded_amount, school_percentage_snapshot, plan_id, product_id',
            )
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

            // The first charge of a subscription on a hosted-checkout rail.
            // `is_renewal: false` by construction — this branch only runs on a
            // still-`pending` transaction, which exists once per subscription.
            void trackSettlement(admin, provider, tx, {
              is_renewal: false,
              event_type: event.type,
            })

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
        .select(
          'transaction_id, status, user_id, tenant_id, plan_id, product_id, amount, currency, refunded_amount, school_percentage_snapshot',
        )
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

        // Inside the `status === 'pending'` guard, so the losing caller of the
        // two that dispatch this event (the PayPal capture route and the
        // webhook) emits nothing.
        void trackSettlement(admin, provider, tx, { event_type: event.type })
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
          'transaction_id, status, user_id, tenant_id, plan_id, product_id, amount, currency, refunded_amount',
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
      const priorRefunded = Number(tx.refunded_amount ?? 0)
      const { data, error } = await admin.rpc('apply_webhook_refund', {
        _provider: provider,
        _provider_event_id: event.providerEventId,
        _transaction_id: txnId,
        _refund_amount: slice,
      })
      if (error) throw new Error(`dispatch ${event.type} failed: ${error.message}`)
      const refund = (data as {
        applied: boolean
        refunded_amount: number | string | null
        is_full_refund: boolean
      }[] | null)?.[0]
      if (!refund) {
        throw new Error(`dispatch ${event.type}: refund transaction ${txnId} was not applicable`)
      }

      // Only on the call that actually moved money — the RPC reports
      // `applied: false` for a redelivery it declined, which must not be
      // counted a second time. Every figure comes from the RPC's own return,
      // so the event can never disagree with the row it describes.
      if (refund.applied) {
        const cumulative = Number(refund.refunded_amount ?? 0)
        void track(
          ANALYTICS_EVENTS.REFUND_ISSUED,
          {
            // A PARTIAL refund keeps the row 'successful' and only records the
            // slice (#547); only a FULL one flips the status and revokes access.
            // Every revenue sum depends on the distinction.
            is_partial: !refund.is_full_refund,
            /** This event's own slice. */
            refunded_amount: cumulative - priorRefunded,
            cumulative_refunded_amount: cumulative,
            /** What the sale is still worth. */
            net_amount: netOfRefunds(saleAmount, cumulative),
            gross_amount: saleAmount,
            currency: tx.currency ?? 'usd',
            provider,
            is_subscription: !!tx.plan_id,
            transaction_id: tx.transaction_id,
            // False means the provider sent no usable figure and `refundedSlice`
            // degraded to a FULL refund — worth being able to filter out of a
            // partial-vs-full breakdown.
            amount_reported_by_provider: event.amount != null,
          },
          { userId: tx.user_id, tenantId: tx.tenant_id },
        )
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

      // `.select()` added for attribution only: the returned row tells us both
      // that the guard actually matched (so a late PAY_CLOSED racing a
      // PAY_SUCCESS emits nothing) and who to attribute the failure to, without
      // a second read.
      const { data: failed, error } = await admin
        .from('transactions')
        .update({ status: 'failed' })
        .eq('transaction_id', txnId)
        .eq('status', 'pending')
        .select('transaction_id, user_id, tenant_id, amount, currency, plan_id, product_id')
        .maybeSingle()
      if (error) throw new Error(`dispatch ${event.type} failed: ${error.message}`)

      if (failed) {
        void track(
          ANALYTICS_EVENTS.PAYMENT_FAILED,
          {
            provider,
            // Hosted rails report a terminal ORDER state (Binance `PAY_CLOSED`
            // on expiry) rather than a decline reason, so the normalized event
            // type is the most specific thing there is to say.
            failure_reason: event.type,
            amount: Number(failed.amount ?? 0),
            currency: failed.currency ?? 'usd',
            is_subscription: !!failed.plan_id,
            transaction_id: failed.transaction_id,
          },
          { userId: failed.user_id, tenantId: failed.tenant_id },
        )
      }
      break
    }
  }
}
