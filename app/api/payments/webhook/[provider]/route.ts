/**
 * Unified, provider-agnostic webhook endpoint.
 *
 * Pipeline (issue #280, Phase 3):
 *   raw body → provider.verifyWebhook → persist to webhook_events (idempotent)
 *            → provider.normalizeWebhookEvent → dispatchBillingEvent → 200
 *
 * This is the path NEW providers (Lemon Squeezy, MercadoPago, Solana, …) use.
 * The legacy Stripe Connect endpoint at /api/stripe/webhook stays canonical for
 * Stripe (it also owns the transactions state machine, payouts and emails) and
 * shares the same dispatchBillingEvent for subscription lifecycle.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPaymentProvider } from '@/lib/payments'
import type { PaymentProvider } from '@/lib/payments/types'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'
import { netOfRefunds } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'

export const runtime = 'nodejs'

// Providers exposed on this endpoint. getPaymentProvider() still gates on
// configured credentials; providers without verify/normalize return 501.
// `manual` and `solana` are intentionally excluded: neither has a signed
// webhook (Solana confirms on-chain via /api/payments/solana/verify), so
// exposing a route for them would be an unauthenticated mutation surface.
const SUPPORTED: PaymentProvider[] = ['stripe', 'paypal', 'lemonsqueezy', 'binance']

/**
 * Provider-specific ACK body. Binance Pay treats anything other than
 * `{"returnCode":"SUCCESS"}` as a failed delivery and keeps retrying (then
 * flags the merchant webhook as failing), so it gets its expected shape.
 * Transport-level ack only — all billing logic stays provider-agnostic.
 */
function ackBody(provider: string, extra: Record<string, unknown> = {}) {
  return provider === 'binance'
    ? { returnCode: 'SUCCESS', returnMessage: null, ...extra }
    : { received: true, ...extra }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase environment variables not set')
  }
  return createClient(url, serviceKey)
}

/** The transaction as it stood BEFORE the dispatcher touched it. */
interface TxSnapshot {
  transaction_id: number
  status: string
  user_id: string | null
  tenant_id: string | null
  amount: number | null
  currency: string | null
  refunded_amount: number | null
  school_percentage_snapshot: number | null
  plan_id: number | null
  product_id: number | null
}

/**
 * Emit the Loop C money event for a dispatched provider event.
 *
 * The pre-dispatch `status` is what decides whether anything is emitted at all,
 * mirroring the dispatcher's own guards one for one: it only settles a
 * `pending` row and only refunds a `successful` one, so a delivery that found
 * the row in any other state changed no money and must not report any.
 */
async function trackMoneyEvent(
  event: { type: string; amount?: number; currency?: string },
  provider: string,
  tx: TxSnapshot,
  admin: SupabaseClient,
): Promise<void> {
  const ctx = { userId: tx.user_id, tenantId: tx.tenant_id }
  const gross = Number(tx.amount ?? 0)
  const snapshot = tx.school_percentage_snapshot ?? null

  if (event.type === 'payment.succeeded' || event.type === 'subscription.activated') {
    // `subscription.activated` also fires for a return-from-expired
    // reactivation, where there is no pending transaction and no new money.
    if (tx.status !== 'pending') return
    // `payment.succeeded` skips subscription orders (they belong to
    // `subscription.activated`) — mirror that or an LS subscription's first
    // charge is counted twice.
    if (event.type === 'payment.succeeded' && tx.plan_id) return

    const net = netOfRefunds(gross, tx.refunded_amount)
    // WHETHER a fee is taken is the capability, never
    // `revenue_splits.applies_to_providers` (retired in #547); the RATE is the
    // row's own snapshot. No snapshot → omit rather than invent.
    const bearsFee = !!PROVIDER_CAPABILITIES[provider as keyof typeof PROVIDER_CAPABILITIES]?.bearsPlatformFee
    await track(
      ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
      {
        provider,
        amount_major: net,
        currency: tx.currency ?? 'usd',
        is_subscription: !!tx.plan_id,
        ...(bearsFee
          ? snapshot != null
            ? { platform_fee: Math.round(net * (100 - Number(snapshot))) / 100 }
            : {}
          : { platform_fee: 0 }),
        school_percentage_snapshot: snapshot,
        gross_amount: gross,
        transaction_id: tx.transaction_id,
        event_type: event.type,
        ...(tx.plan_id ? { plan_id: tx.plan_id } : {}),
        ...(tx.product_id ? { product_id: tx.product_id } : {}),
      },
      ctx,
    )

    const sourceType = tx.plan_id ? 'subscription' : 'product'
    const sourceId = tx.plan_id ?? tx.product_id
    if (tx.user_id && sourceId != null) {
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
    }
    return
  }

  if (event.type === 'refund.succeeded') {
    if (tx.status !== 'successful') return
    // Mirrors `refundedSlice` in lib/payments/webhook-dispatch.ts: an absent
    // amount, or one denominated in a currency the sale is not in, degrades to
    // a FULL refund — the conservative direction, and the behaviour that
    // predates #547.
    const prior = Number(tx.refunded_amount ?? 0)
    const eventCurrency = event.currency?.toLowerCase()
    const rowCurrency = tx.currency?.toLowerCase()
    const reported =
      event.amount != null &&
      Number.isFinite(event.amount) &&
      event.amount > 0 &&
      !(eventCurrency && rowCurrency && eventCurrency !== rowCurrency)
        ? event.amount
        : gross
    const cumulative = Math.min(prior + reported, gross)
    // A cent of tolerance: NUMERIC(10,2) money compared with float arithmetic.
    const isFullRefund = cumulative >= gross - 0.005

    await track(
      ANALYTICS_EVENTS.REFUND_ISSUED,
      {
        // A PARTIAL refund leaves the row 'successful' and only records the
        // slice (#547) — the distinction every revenue sum depends on.
        is_partial: !isFullRefund,
        refunded_amount: cumulative - prior,
        cumulative_refunded_amount: cumulative,
        net_amount: netOfRefunds(gross, cumulative),
        gross_amount: gross,
        currency: tx.currency ?? 'usd',
        provider,
        is_subscription: !!tx.plan_id,
        transaction_id: tx.transaction_id,
        amount_reported_by_provider: event.amount != null,
      },
      ctx,
    )
    return
  }

  if (event.type === 'payment.failed') {
    if (tx.status !== 'pending') return
    await track(
      ANALYTICS_EVENTS.PAYMENT_FAILED,
      {
        provider,
        // Hosted rails report a terminal state (Binance `PAY_CLOSED` on expiry)
        // rather than a decline reason; the normalized type is all we have.
        failure_reason: event.type,
        amount: gross,
        currency: tx.currency ?? 'usd',
        is_subscription: !!tx.plan_id,
        transaction_id: tx.transaction_id,
      },
      ctx,
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params

  if (!SUPPORTED.includes(provider as PaymentProvider)) {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 404 })
  }

  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  // Instantiate provider (throws if credentials are not configured).
  let p
  try {
    p = getPaymentProvider(provider as PaymentProvider)
  } catch (err) {
    console.error(`[webhook/${provider}] provider not configured:`, err)
    return NextResponse.json({ error: 'Provider not configured' }, { status: 503 })
  }

  if (!p.verifyWebhook || !p.normalizeWebhookEvent) {
    return NextResponse.json(
      { error: `Provider ${provider} does not support unified webhooks yet` },
      { status: 501 }
    )
  }

  // 1. Verify signature on the RAW body.
  const verified = await p.verifyWebhook(rawBody, headers)
  if (!verified) {
    console.error(`[webhook/${provider}] signature verification failed`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 2. Normalize. null = an event type we do not model — ack so the provider
  //    stops retrying.
  const event = await p.normalizeWebhookEvent(rawBody)
  if (!event) {
    return NextResponse.json(ackBody(provider, { ignored: true }))
  }

  // Idempotency requires a stable, provider-unique event id. A synthesized key
  // (e.g. by type+sub) would collapse two legitimate same-type events — two
  // renewals on the same subscription — into one and silently drop the second.
  // Adapters MUST supply providerEventId; reject (no retry) if absent.
  const providerEventId = event.providerEventId
  if (!providerEventId) {
    console.error(`[webhook/${provider}] normalized event missing providerEventId — cannot dedupe`)
    return NextResponse.json({ error: 'Event missing provider event id' }, { status: 422 })
  }

  const admin = getSupabaseAdmin()

  // 3. Idempotency: skip if this event was already processed.
  const { data: existing } = await admin
    .from('webhook_events')
    .select('id, processed_at')
    .eq('provider', provider)
    .eq('provider_event_id', providerEventId)
    .maybeSingle()

  if (existing?.processed_at) {
    return NextResponse.json(ackBody(provider, { duplicate: true }))
  }

  let rowId = existing?.id as string | undefined
  if (!rowId) {
    const { data: inserted, error: insertErr } = await admin
      .from('webhook_events')
      .insert({
        provider,
        provider_event_id: providerEventId,
        event_type: event.type,
        payload: event.raw as Record<string, unknown>,
      })
      .select('id')
      .single()

    if (insertErr) {
      // 23505 = unique violation: a concurrent delivery beat us to it.
      if ((insertErr as { code?: string }).code === '23505') {
        return NextResponse.json(ackBody(provider, { duplicate: true }))
      }
      console.error(`[webhook/${provider}] failed to persist event:`, insertErr)
      return NextResponse.json({ error: 'Failed to persist event' }, { status: 500 })
    }
    rowId = inserted.id
  }

  // Snapshot the referenced transaction BEFORE dispatching, because the
  // dispatcher is about to overwrite the two things the money events are
  // derived from: `status` (which says whether this delivery is the one that
  // actually settles the sale) and `refunded_amount` (whose delta IS the refund
  // slice). Reading afterwards would report every redelivery as a fresh sale.
  //
  // One extra SELECT, on the four event types that move money and only when the
  // provider round-tripped our correlation id.
  const MONEY_EVENTS = ['payment.succeeded', 'subscription.activated', 'refund.succeeded', 'payment.failed']
  const referencedTxnId =
    MONEY_EVENTS.includes(event.type) && event.reference
      ? Number.parseInt(event.reference, 10)
      : NaN
  let txBefore: TxSnapshot | null = null
  if (!Number.isNaN(referencedTxnId)) {
    const { data } = await admin
      .from('transactions')
      .select(
        'transaction_id, status, user_id, tenant_id, amount, currency, refunded_amount, school_percentage_snapshot, plan_id, product_id',
      )
      .eq('transaction_id', referencedTxnId)
      .maybeSingle()
    txBefore = (data as TxSnapshot | null) ?? null
  }

  // 4. Dispatch. On failure, record the error and 500 so the provider retries.
  try {
    await dispatchBillingEvent(event, { provider, admin })
  } catch (err) {
    console.error(`[webhook/${provider}] dispatch failed:`, err)
    await admin
      .from('webhook_events')
      .update({ error: err instanceof Error ? err.message : String(err) })
      .eq('id', rowId)
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 })
  }

  // Loop C for every unified rail (Lemon Squeezy, PayPal, Binance). Emitted
  // after a dispatch that did not throw and downstream of the step-3 duplicate
  // guard, so one provider event produces at most one money event.
  //
  // Deliberately NOT also emitted from `app/api/payments/paypal/capture`: that
  // route dispatches the SAME `payment.succeeded` for the same capture, and the
  // dispatcher's `status='pending'` guard means only one of the two actually
  // settles the sale. Firing at both call sites would double-count every PayPal
  // purchase. The capture route's own dispatch is backstopped by the
  // `PAYMENT.CAPTURE.COMPLETED` webhook, which lands here.
  if (txBefore) {
    await trackMoneyEvent(event, provider, txBefore, admin)
  }

  // 5. Mark processed. If this write fails the event will be redelivered and
  //    re-dispatched; the dispatcher is idempotent (status writes converge,
  //    period end comes from the event, not now()), so log rather than fail.
  const { error: markErr } = await admin
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', rowId)
  if (markErr) {
    console.error(`[webhook/${provider}] failed to mark event ${providerEventId} processed:`, markErr)
  }

  return NextResponse.json(ackBody(provider))
}
