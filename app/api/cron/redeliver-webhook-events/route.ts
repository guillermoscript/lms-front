/**
 * Cron: re-dispatch stalled webhook events (issue #625 follow-up).
 *
 * The atomic claim contract leaves exactly one orphan case: a worker that dies
 * WITHOUT running failWebhookEvent (OOM, serverless kill, deploy) holds its
 * lease until expiry, and every provider retry inside that window is answered
 * 409. If the provider's remaining redeliveries all land inside the lease — or
 * it gives up entirely (bounded, front-loaded retry schedules) — the event is
 * never processed by anyone: the student paid but is never enrolled, the
 * school paid but is never extended.
 *
 * This sweeper is that missing redelivery. It scans `webhook_events` for rows
 * that are unprocessed AND either
 *   - lease expired without release (the crashed-worker case), or
 *   - released with an error (failWebhookEvent ran; the provider may retry,
 *     but nothing guarantees it still will),
 * then replays the pipeline the routes run, from the payload persisted at
 * ingest: normalize → claim → dispatch → complete. Signature verification is
 * NOT repeated — the payload was only persisted after verifying, and the
 * provider's secret may not even be presentable outside a live delivery.
 *
 * Safe against every concurrent delivery by construction, because it goes
 * through the SAME claim_webhook_event lease: if a live retry claims first,
 * this run gets 'processing'/'completed' and walks away.
 *
 * Runs every 10 minutes via Vercel Cron (see vercel.json). Secured by
 * CRON_SECRET. Events that keep failing park at MAX_SWEEP_ATTEMPTS with their
 * `last_error` retained for manual review — a poison payload must not be
 * ground against the same exception forever.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPaymentProvider } from '@/lib/payments'
import type { IPaymentProvider, PaymentProvider } from '@/lib/payments/types'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import {
  PLATFORM_WEBHOOK_PROVIDERS,
  getPlatformBillingProvider,
  platformWebhookNamespace,
} from '@/lib/billing/platform-billing'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'
import {
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  UNIFIED_STUDENT_WEBHOOK_PROVIDERS,
} from '@/lib/payments/webhook-event-claim'

export const runtime = 'nodejs'

/** Park an event for manual review after this many granted leases. */
const MAX_SWEEP_ATTEMPTS = 8
/** Per-run batch cap; the next run picks up the rest. */
const BATCH_SIZE = 25
/**
 * Leave fresh events to the provider's own retries first — the sweeper is a
 * backstop, not a competitor racing live deliveries.
 */
const MIN_AGE_MS = 10 * 60 * 1000

// `webhook_events.provider` for platform-billing rows is namespaced by
// platformWebhookNamespace(); student rows carry the bare slug.
const PLATFORM_NS_PREFIX = platformWebhookNamespace('')

interface StalledEventRow {
  id: string
  provider: string
  provider_event_id: string
  event_type: string | null
  payload: Record<string, unknown>
  attempt_count: number
}

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const nowIso = new Date().toISOString()
  const ageCutoff = new Date(Date.now() - MIN_AGE_MS).toISOString()

  const { data, error } = await admin
    .from('webhook_events')
    .select('id, provider, provider_event_id, event_type, payload, attempt_count')
    .is('processed_at', null)
    .or(
      `processing_lease_expires_at.lte.${nowIso},and(processing_started_at.is.null,last_error.not.is.null)`,
    )
    .lt('attempt_count', MAX_SWEEP_ATTEMPTS)
    .lte('received_at', ageCutoff)
    .order('received_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[cron/redeliver-webhook-events] scan failed:', error)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }

  const result = {
    scanned: (data ?? []).length,
    redelivered: 0,
    failed: 0,
    retired: 0,
    skipped: 0,
  }

  for (const row of (data ?? []) as StalledEventRow[]) {
    try {
      const isPlatform = row.provider.startsWith(PLATFORM_NS_PREFIX)
      const slug = (
        isPlatform ? row.provider.slice(PLATFORM_NS_PREFIX.length) : row.provider
      ) as PaymentProvider

      // Only rows written by the two unified webhook routes are replayable
      // here; anything else (unknown namespace, provider since delisted) is
      // left alone rather than guessed at.
      const replayable = isPlatform
        ? PLATFORM_WEBHOOK_PROVIDERS.includes(slug)
        : UNIFIED_STUDENT_WEBHOOK_PROVIDERS.includes(slug)
      if (!replayable) {
        result.skipped++
        continue
      }

      let adapter: IPaymentProvider
      try {
        adapter = isPlatform ? getPlatformBillingProvider(slug) : getPaymentProvider(slug)
      } catch {
        // Not configured in this environment — nothing this run can do.
        result.skipped++
        continue
      }
      if (!adapter.normalizeWebhookEvent) {
        result.skipped++
        continue
      }

      // The payload column holds the event exactly as the provider sent it
      // (`event.raw`), so the adapter's own normalizer runs unchanged.
      const event = await adapter.normalizeWebhookEvent(JSON.stringify(row.payload ?? {}))

      // Claim through the same lease the live routes use. Anything but
      // 'claimed' means another worker owns it or already finished — walk away.
      const claim = await claimWebhookEvent(admin, {
        provider: row.provider,
        providerEventId: row.provider_event_id,
        eventType: row.event_type ?? event?.type ?? 'unknown',
        payload: row.payload ?? {},
      })
      if (claim.status !== 'claimed') {
        result.skipped++
        continue
      }

      // An event type the adapter no longer models: the live route would ack
      // it without dispatching, so retire it instead of re-scanning forever.
      if (!event) {
        await completeWebhookEvent(admin, claim)
        result.retired++
        continue
      }

      try {
        if (isPlatform) {
          // Same revert ability the billing route hands the dispatcher: only
          // providers that can swap a price in place get one.
          const caps = PROVIDER_CAPABILITIES[slug]
          const revertToPrice =
            caps?.supportsPlanChange && adapter.updateSubscription
              ? async (providerSubscriptionId: string, providerPriceId: string) => {
                  await adapter.updateSubscription!(providerSubscriptionId, {
                    newProviderPriceId: providerPriceId,
                    prorationBehavior: 'none',
                  })
                }
              : undefined
          await dispatchPlatformBillingEvent(event, { provider: slug, admin, revertToPrice })
        } else {
          await dispatchBillingEvent(event, { provider: slug, admin })
        }
        await completeWebhookEvent(admin, claim)
        result.redelivered++
      } catch (dispatchErr) {
        console.error(
          `[cron/redeliver-webhook-events] redelivery failed for ${row.provider} ${row.provider_event_id}:`,
          dispatchErr,
        )
        try {
          await failWebhookEvent(admin, claim, dispatchErr)
        } catch (releaseErr) {
          console.error('[cron/redeliver-webhook-events] failed to release claim:', releaseErr)
        }
        result.failed++
      }
    } catch (rowErr) {
      // Normalizer or claim blew up — log and move to the next row; the event
      // stays visible to the next run (or parks at the attempt cap).
      console.error(
        `[cron/redeliver-webhook-events] could not replay ${row.provider} ${row.provider_event_id}:`,
        rowErr,
      )
      result.failed++
    }
  }

  console.log('[cron/redeliver-webhook-events]', JSON.stringify(result))
  return NextResponse.json(result)
}
