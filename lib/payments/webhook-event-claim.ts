import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentProvider } from '@/lib/payments/types'

export const WEBHOOK_CLAIM_LEASE_SECONDS = 5 * 60

/**
 * Providers exposed on the unified STUDENT webhook endpoint
 * (`/api/payments/webhook/[provider]`), which writes un-namespaced rows to
 * `webhook_events`. Lives here (not in the route file — Next.js route modules
 * may only export handlers) because the redelivery cron needs the same list to
 * know which stalled ledger rows it is allowed to re-dispatch.
 *
 * `manual` and `solana` are intentionally excluded: neither has a signed
 * webhook (Solana confirms on-chain via /api/payments/solana/verify), so
 * exposing a route for them would be an unauthenticated mutation surface.
 */
export const UNIFIED_STUDENT_WEBHOOK_PROVIDERS: PaymentProvider[] = [
  'stripe',
  'paypal',
  'lemonsqueezy',
  'binance',
]

export type WebhookClaimResult =
  | { status: 'claimed'; eventId: string; claimToken: string; attemptCount: number }
  | { status: 'processing'; eventId: string; attemptCount: number }
  | { status: 'completed'; eventId: string; attemptCount: number }

interface ClaimRow {
  event_id: string
  claim_status: 'claimed' | 'processing' | 'completed'
  current_attempt_count: number
}

interface ClaimWebhookEventParams {
  provider: string
  providerEventId: string
  eventType: string
  payload: Record<string, unknown>
  leaseSeconds?: number
}

function rpcError(label: string, error: { message?: string }): Error {
  return new Error(`${label} failed: ${error.message ?? JSON.stringify(error)}`)
}

/**
 * Atomically insert or lease a webhook event. Only a `claimed` result may
 * dispatch business side effects; the other outcomes are deterministic ACKs.
 */
export async function claimWebhookEvent(
  admin: SupabaseClient,
  {
    provider,
    providerEventId,
    eventType,
    payload,
    leaseSeconds = WEBHOOK_CLAIM_LEASE_SECONDS,
  }: ClaimWebhookEventParams,
): Promise<WebhookClaimResult> {
  const claimToken = randomUUID()
  const { data, error } = await admin.rpc('claim_webhook_event', {
    _provider: provider,
    _provider_event_id: providerEventId,
    _event_type: eventType,
    _payload: payload,
    _claim_token: claimToken,
    _lease_seconds: leaseSeconds,
  })

  if (error) throw rpcError('webhook event claim', error)

  const row = (data as ClaimRow[] | null)?.[0]
  if (!row || !['claimed', 'processing', 'completed'].includes(row.claim_status)) {
    throw new Error('webhook event claim returned an invalid result')
  }

  if (row.claim_status === 'claimed') {
    return {
      status: 'claimed',
      eventId: row.event_id,
      claimToken,
      attemptCount: row.current_attempt_count,
    }
  }

  return {
    status: row.claim_status,
    eventId: row.event_id,
    attemptCount: row.current_attempt_count,
  }
}

/** Mark a claimed event complete. A false result means this worker lost ownership. */
export async function completeWebhookEvent(
  admin: SupabaseClient,
  claim: Extract<WebhookClaimResult, { status: 'claimed' }>,
): Promise<void> {
  const { data, error } = await admin.rpc('complete_webhook_event', {
    _event_id: claim.eventId,
    _claim_token: claim.claimToken,
  })

  if (error) throw rpcError('webhook event completion', error)
  if (data !== true) throw new Error('webhook event completion rejected: claim ownership lost')
}

/** Record a transient failure and immediately release the event for retry. */
export async function failWebhookEvent(
  admin: SupabaseClient,
  claim: Extract<WebhookClaimResult, { status: 'claimed' }>,
  reason: unknown,
): Promise<void> {
  const message = reason instanceof Error ? reason.message : String(reason)
  const { data, error } = await admin.rpc('fail_webhook_event', {
    _event_id: claim.eventId,
    _claim_token: claim.claimToken,
    _last_error: message,
  })

  if (error) throw rpcError('webhook event failure release', error)
  if (data !== true) throw new Error('webhook event failure release rejected: claim ownership lost')
}
