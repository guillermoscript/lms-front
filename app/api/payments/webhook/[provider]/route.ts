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
import { createClient } from '@supabase/supabase-js'
import { getPaymentProvider } from '@/lib/payments'
import type { PaymentProvider } from '@/lib/payments/types'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'

export const runtime = 'nodejs'

// Providers exposed on this endpoint. getPaymentProvider() still gates on
// configured credentials; providers without verify/normalize return 501.
// `manual` and `solana` are intentionally excluded: neither has a signed
// webhook (Solana confirms on-chain via /api/payments/solana/verify), so
// exposing a route for them would be an unauthenticated mutation surface.
const SUPPORTED: PaymentProvider[] = ['stripe', 'paypal', 'lemonsqueezy']

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase environment variables not set')
  }
  return createClient(url, serviceKey)
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
    return NextResponse.json({ received: true, ignored: true })
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
    return NextResponse.json({ received: true, duplicate: true })
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
        return NextResponse.json({ received: true, duplicate: true })
      }
      console.error(`[webhook/${provider}] failed to persist event:`, insertErr)
      return NextResponse.json({ error: 'Failed to persist event' }, { status: 500 })
    }
    rowId = inserted.id
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

  return NextResponse.json({ received: true })
}
