import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { assertSafeUrl } from './url-guard'
import { signWebhookPayload } from './signing'
import { WEBHOOK_TEST_EVENT } from './events'

/**
 * Outbound webhook delivery worker. Rows are written by the DB triggers (see
 * 20261016140000_outbound_webhooks.sql); this module claims due rows, POSTs them
 * signed, and records the outcome. Used by the cron route and "Send test".
 */

export const REQUEST_TIMEOUT_MS = 10_000
/** Delay before attempt N+1 after attempt N fails (index = attempts made so far - 1). */
export const RETRY_DELAYS_SECONDS = [60, 300, 1_800, 7_200, 21_600, 43_200, 86_400] as const
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1
/** Exhausted deliveries in a row before an endpoint is switched off. */
export const AUTO_DISABLE_AFTER = 10
const RESPONSE_ERROR_MAX = 300

export interface DeliveryRow {
  id: string
  endpoint_id: string
  tenant_id: string | null
  event_id: string
  event_type: string
  payload: Record<string, unknown>
  attempts: number
}

export interface EndpointRow {
  id: string
  tenant_id: string | null
  url: string
  secret: string
  is_active: boolean
  consecutive_failures: number
}

export interface AttemptOutcome {
  ok: boolean
  statusCode: number | null
  error: string | null
}

/** Seconds until the next attempt, or null when `attemptsMade` has used them all. */
export function nextRetryDelaySeconds(attemptsMade: number): number | null {
  if (attemptsMade >= MAX_ATTEMPTS) return null
  return RETRY_DELAYS_SECONDS[attemptsMade - 1] ?? null
}

/** One signed POST. Never throws; never follows redirects. */
export async function postSigned(
  endpoint: Pick<EndpointRow, 'url' | 'secret'>,
  delivery: Pick<DeliveryRow, 'id' | 'event_id' | 'event_type' | 'payload'>,
  fetchImpl: typeof fetch = fetch
): Promise<AttemptOutcome> {
  const guard = await assertSafeUrl(endpoint.url)
  if (!guard.ok) return { ok: false, statusCode: null, error: `blocked: ${guard.reason}` }

  const body = JSON.stringify(delivery.payload)
  const timestamp = Math.floor(Date.now() / 1000)
  try {
    const res = await fetchImpl(guard.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LMS-Webhooks/1.0',
        'X-Webhook-Id': delivery.event_id,
        'X-Webhook-Delivery': delivery.id,
        'X-Webhook-Event': delivery.event_type,
        'X-Webhook-Timestamp': String(timestamp),
        'X-Webhook-Signature': signWebhookPayload(endpoint.secret, timestamp, body),
      },
      body,
    })
    // Drain so the socket is released; we never store response bodies.
    await res.arrayBuffer().catch(() => undefined)
    if (res.status >= 200 && res.status < 300) return { ok: true, statusCode: res.status, error: null }
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, statusCode: res.status, error: 'redirect not followed' }
    }
    return { ok: false, statusCode: res.status, error: `HTTP ${res.status}` }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    const msg = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network error'
    return { ok: false, statusCode: null, error: msg }
  }
}

async function recordOutcome(
  admin: SupabaseClient,
  delivery: DeliveryRow,
  endpoint: EndpointRow,
  outcome: AttemptOutcome
) {
  const attempts = delivery.attempts + 1
  const now = new Date()

  if (outcome.ok) {
    await admin
      .from('outbound_webhook_deliveries')
      .update({
        status: 'success', attempts, delivered_at: now.toISOString(),
        last_status_code: outcome.statusCode, last_error: null,
      })
      .eq('id', delivery.id)
    if (endpoint.consecutive_failures > 0) {
      await admin.from('outbound_webhook_endpoints').update({ consecutive_failures: 0 }).eq('id', endpoint.id)
    }
    return
  }

  const delay = nextRetryDelaySeconds(attempts)
  const error = outcome.error?.slice(0, RESPONSE_ERROR_MAX) ?? null
  if (delay === null) {
    await admin
      .from('outbound_webhook_deliveries')
      .update({ status: 'failed', attempts, last_status_code: outcome.statusCode, last_error: error })
      .eq('id', delivery.id)
    const failures = endpoint.consecutive_failures + 1
    await admin
      .from('outbound_webhook_endpoints')
      .update(
        failures >= AUTO_DISABLE_AFTER
          ? { consecutive_failures: failures, is_active: false, disabled_reason: 'too_many_failures', updated_at: now.toISOString() }
          : { consecutive_failures: failures }
      )
      .eq('id', endpoint.id)
    return
  }

  await admin
    .from('outbound_webhook_deliveries')
    .update({
      attempts,
      next_attempt_at: new Date(now.getTime() + delay * 1000).toISOString(),
      last_status_code: outcome.statusCode,
      last_error: error,
    })
    .eq('id', delivery.id)
}

export interface ProcessResult { claimed: number; succeeded: number; failed: number; skipped: number }

/** Claim and send up to `limit` due deliveries. */
export async function processDueDeliveries(admin: SupabaseClient, limit = 50): Promise<ProcessResult> {
  const result: ProcessResult = { claimed: 0, succeeded: 0, failed: 0, skipped: 0 }
  const { data, error } = await admin.rpc('claim_outbound_webhook_deliveries', { _limit: limit })
  if (error) throw new Error(`claim failed: ${error.code ?? 'unknown'}`)
  const deliveries = (data ?? []) as DeliveryRow[]
  result.claimed = deliveries.length
  if (deliveries.length === 0) return result

  const ids = [...new Set(deliveries.map((d) => d.endpoint_id))]
  const { data: endpoints } = await admin
    .from('outbound_webhook_endpoints')
    .select('id, tenant_id, url, secret, is_active, consecutive_failures')
    .in('id', ids)
  const byId = new Map((endpoints ?? []).map((e) => [e.id as string, e as EndpointRow]))

  // Bounded concurrency: a slow receiver must not stall the whole batch.
  const queue = [...deliveries]
  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      const endpoint = byId.get(d.endpoint_id)
      if (!endpoint || !endpoint.is_active) {
        await admin
          .from('outbound_webhook_deliveries')
          .update({ status: 'failed', last_error: 'endpoint disabled' })
          .eq('id', d.id)
        result.skipped++
        continue
      }
      const outcome = await postSigned(endpoint, d)
      await recordOutcome(admin, d, endpoint, outcome)
      if (outcome.ok) result.succeeded++
      else result.failed++
    }
  })
  await Promise.all(workers)
  return result
}

/**
 * Send a `webhook.test` event to one endpoint right now, bypassing its event
 * subscription. Recorded as a delivery so it shows in the log.
 */
export async function sendTestDelivery(admin: SupabaseClient, endpoint: EndpointRow): Promise<AttemptOutcome> {
  const eventId = randomUUID()
  const payload = {
    id: eventId,
    type: WEBHOOK_TEST_EVENT,
    created_at: new Date().toISOString(),
    tenant_id: endpoint.tenant_id,
    data: { message: 'This is a test event from your LMS.' },
  }
  const { data: row, error } = await admin
    .from('outbound_webhook_deliveries')
    .insert({
      endpoint_id: endpoint.id, tenant_id: endpoint.tenant_id, event_id: eventId,
      event_type: WEBHOOK_TEST_EVENT, payload,
      // Leased far ahead so the cron cannot also pick it up mid-flight.
      next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    .select('id, endpoint_id, tenant_id, event_id, event_type, payload, attempts')
    .single()
  if (error || !row) return { ok: false, statusCode: null, error: 'could not queue test' }

  const outcome = await postSigned(endpoint, row as DeliveryRow)
  // Tests never retry: one attempt, final.
  await admin
    .from('outbound_webhook_deliveries')
    .update({
      status: outcome.ok ? 'success' : 'failed',
      attempts: 1,
      delivered_at: outcome.ok ? new Date().toISOString() : null,
      last_status_code: outcome.statusCode,
      last_error: outcome.error,
    })
    .eq('id', row.id)
  return outcome
}
