/**
 * Unified, provider-agnostic webhook endpoint for school → platform billing.
 *
 * Pipeline, identical to the student endpoint at
 * `app/api/payments/webhook/[provider]` (issue #603):
 *   raw body → provider.verifyWebhook → persist to webhook_events (idempotent)
 *            → provider.normalizeWebhookEvent → dispatchPlatformBillingEvent → 200
 *
 * Replaces `app/api/stripe/platform-webhook`, which switched on Stripe event
 * names and wrote `payment_provider: 'stripe'` inline. Same signing secret
 * (`STRIPE_PLATFORM_WEBHOOK_SECRET`), new path — the Stripe dashboard endpoint
 * URL must be repointed at deploy (see docs/DEPLOYMENT.md).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PaymentProvider } from '@/lib/payments/types'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import {
  PLATFORM_WEBHOOK_PROVIDERS,
  getPlatformBillingProvider,
  platformWebhookNamespace,
} from '@/lib/billing/platform-billing'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'

export const runtime = 'nodejs'

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
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params

  if (!PLATFORM_WEBHOOK_PROVIDERS.includes(provider as PaymentProvider)) {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 404 })
  }

  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  // Instantiate with the PLATFORM webhook secret — the same provider is also
  // registered for the student loop under a different signing secret.
  let p
  try {
    p = getPlatformBillingProvider(provider as PaymentProvider)
  } catch (err) {
    console.error(`[billing/webhook/${provider}] provider not configured:`, err)
    return NextResponse.json({ error: 'Provider not configured' }, { status: 503 })
  }

  if (!p.verifyWebhook || !p.normalizeWebhookEvent) {
    return NextResponse.json(
      { error: `Provider ${provider} does not support unified webhooks yet` },
      { status: 501 },
    )
  }

  // 1. Verify signature on the RAW body.
  const verified = await p.verifyWebhook(rawBody, headers)
  if (!verified) {
    console.error(`[billing/webhook/${provider}] signature verification failed`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 2. Normalize. null = an event type we do not model — ack so the provider
  //    stops retrying.
  const event = await p.normalizeWebhookEvent(rawBody)
  if (!event) {
    return NextResponse.json({ received: true, ignored: true })
  }

  // Idempotency needs a stable, provider-unique event id. A synthesized key
  // would collapse two legitimate same-type events — two renewals on the same
  // subscription — into one and silently drop the second.
  const providerEventId = event.providerEventId
  if (!providerEventId) {
    console.error(`[billing/webhook/${provider}] normalized event missing providerEventId — cannot dedupe`)
    return NextResponse.json({ error: 'Event missing provider event id' }, { status: 422 })
  }

  const admin = getSupabaseAdmin()
  const ledgerProvider = platformWebhookNamespace(provider)

  // 3. Idempotency: skip if this event was already processed.
  const { data: existing, error: lookupErr } = await admin
    .from('webhook_events')
    .select('id, processed_at')
    .eq('provider', ledgerProvider)
    .eq('provider_event_id', providerEventId)
    .maybeSingle()

  if (lookupErr) {
    console.error(`[billing/webhook/${provider}] event lookup failed:`, lookupErr)
    return NextResponse.json({ error: 'Event lookup failed' }, { status: 500 })
  }

  if (existing?.processed_at) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // A row without processed_at is a previous attempt that failed mid-flight;
  // reuse it and try again rather than inserting a second one.
  let rowId = existing?.id as string | undefined
  if (!rowId) {
    const { data: inserted, error: insertErr } = await admin
      .from('webhook_events')
      .insert({
        provider: ledgerProvider,
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
      console.error(`[billing/webhook/${provider}] failed to persist event:`, insertErr)
      return NextResponse.json({ error: 'Failed to persist event' }, { status: 500 })
    }
    rowId = inserted.id
  }

  // The revert half of the over-limit downgrade guard, expressed as an ability
  // rather than a provider: only providers that can swap a price in place get
  // one, and without it the dispatcher applies the downgrade to the DB instead.
  const caps = PROVIDER_CAPABILITIES[provider as PaymentProvider]
  const revertToPrice =
    caps?.supportsPlanChange && p.updateSubscription
      ? async (providerSubscriptionId: string, providerPriceId: string) => {
          await p.updateSubscription!(providerSubscriptionId, {
            newProviderPriceId: providerPriceId,
            prorationBehavior: 'none',
          })
        }
      : undefined

  // 4. Dispatch. On failure, record the error and 500 so the provider retries.
  try {
    await dispatchPlatformBillingEvent(event, { provider, admin, revertToPrice })
  } catch (err) {
    console.error(`[billing/webhook/${provider}] dispatch failed:`, err)
    await admin
      .from('webhook_events')
      .update({ error: err instanceof Error ? err.message : String(err) })
      .eq('id', rowId)
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 })
  }

  // 5. Mark processed. If this write fails the event is redelivered and
  //    re-dispatched; the dispatcher converges (status writes are absolute,
  //    periods come from the event, not now()), so log rather than fail.
  const { error: markErr } = await admin
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', rowId)
  if (markErr) {
    console.error(`[billing/webhook/${provider}] failed to mark event ${providerEventId} processed:`, markErr)
  }

  return NextResponse.json({ received: true })
}
