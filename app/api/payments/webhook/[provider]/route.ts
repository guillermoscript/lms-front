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
import {
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  UNIFIED_STUDENT_WEBHOOK_PROVIDERS,
} from '@/lib/payments/webhook-event-claim'

export const runtime = 'nodejs'

// Providers exposed on this endpoint (shared with the redelivery cron; see the
// definition for why manual/solana are excluded). getPaymentProvider() still
// gates on configured credentials; providers without verify/normalize get 501.
const SUPPORTED: PaymentProvider[] = UNIFIED_STUDENT_WEBHOOK_PROVIDERS

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

  // 3. Atomically insert-or-claim before dispatch. Both student and platform
  // webhook routes use this exact lease contract.
  let claim
  try {
    claim = await claimWebhookEvent(admin, {
      provider,
      providerEventId,
      eventType: event.type,
      payload: event.raw as Record<string, unknown>,
    })
  } catch (err) {
    console.error(`[webhook/${provider}] event claim failed:`, err)
    return NextResponse.json({ error: 'Event claim failed' }, { status: 500 })
  }

  if (claim.status === 'completed') {
    return NextResponse.json(
      ackBody(provider, { duplicate: true, eventStatus: 'already_completed' }),
    )
  }
  if (claim.status === 'processing') {
    return NextResponse.json(
      provider === 'binance'
        ? {
            returnCode: 'FAIL',
            returnMessage: 'Event is already processing',
            processing: true,
            eventStatus: 'already_processing',
          }
        : ackBody(provider, { processing: true, eventStatus: 'already_processing' }),
      { status: 409, headers: { 'Retry-After': '30' } },
    )
  }

  // 4. Dispatch. On failure, record the error and 500 so the provider retries.
  try {
    await dispatchBillingEvent(event, { provider, admin })
  } catch (err) {
    console.error(`[webhook/${provider}] dispatch failed:`, err)
    try {
      await failWebhookEvent(admin, claim, err)
    } catch (releaseErr) {
      console.error(`[webhook/${provider}] failed to release claim:`, releaseErr)
    }
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 })
  }

  // 5. Fence completion by token and fail closed if it is not durable.
  try {
    await completeWebhookEvent(admin, claim)
  } catch (err) {
    console.error(`[webhook/${provider}] failed to complete event ${providerEventId}:`, err)
    try {
      await failWebhookEvent(admin, claim, err)
    } catch (releaseErr) {
      console.error(`[webhook/${provider}] failed to release claim after completion error:`, releaseErr)
    }
    return NextResponse.json({ error: 'Event completion failed' }, { status: 500 })
  }

  return NextResponse.json(ackBody(provider, { eventStatus: 'accepted' }))
}
