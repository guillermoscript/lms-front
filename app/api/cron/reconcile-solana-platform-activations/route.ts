/**
 * Retry observed Solana platform payments whose entitlement activation did not
 * complete in the verification request (#622).
 *
 * Every row is leased through the same token-fenced RPC as the live poll. The
 * downstream dispatcher deduplicates the on-chain signature, so reclaiming a
 * crashed worker cannot extend the paid period twice.
 */

import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  processSolanaPlatformActivation,
  SOLANA_ACTIVATION_MAX_ATTEMPTS,
} from '@/lib/billing/solana-platform-activation'

export const runtime = 'nodejs'

const BATCH_SIZE = 25

interface ActivationQueueRow {
  request_id: string
}

interface ParkedActivationRow {
  request_id: string
  tenant_id: string
  provider_charge_id: string | null
  activation_attempt_count: number
  activation_last_error: string | null
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
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
  if (!cronSecret || !provided || !safeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from('platform_payment_requests')
    .select('request_id')
    .eq('payment_provider', 'solana')
    .in('activation_state', ['observed', 'processing', 'failed_retryable'])
    .or(
      `activation_state.eq.observed,and(activation_state.eq.processing,activation_lease_expires_at.lte.${nowIso}),and(activation_state.eq.failed_retryable,activation_next_retry_at.lte.${nowIso})`,
    )
    .lt('activation_attempt_count', SOLANA_ACTIVATION_MAX_ATTEMPTS)
    .order('payment_observed_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[cron/reconcile-solana-platform-activations] scan failed:', error)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }

  const result = {
    scanned: data?.length ?? 0,
    activated: 0,
    failed: 0,
    processing: 0,
    alerts: 0,
    errors: 0,
  }

  for (const row of (data ?? []) as ActivationQueueRow[]) {
    try {
      const activation = await processSolanaPlatformActivation(admin, row.request_id)
      if (activation.state === 'activated') result.activated++
      else if (activation.state === 'processing') result.processing++
      else if (activation.state === 'failed_retryable') result.failed++
    } catch (activationError) {
      result.errors++
      console.error(
        `[cron/reconcile-solana-platform-activations] request ${row.request_id} failed:`,
        activationError,
      )
    }
  }

  // Emit one durable structured alert when automatic retries park. Keeping an
  // alert timestamp prevents every ten-minute run from paging the same row.
  const { data: parked, error: parkedError } = await admin
    .from('platform_payment_requests')
    .select(
      'request_id, tenant_id, provider_charge_id, activation_attempt_count, activation_last_error',
    )
    .eq('payment_provider', 'solana')
    .eq('activation_state', 'failed_retryable')
    .gte('activation_attempt_count', SOLANA_ACTIVATION_MAX_ATTEMPTS)
    .is('activation_alerted_at', null)
    .limit(BATCH_SIZE)

  if (parkedError) {
    result.errors++
    console.error('[cron/reconcile-solana-platform-activations] alert scan failed:', parkedError)
  } else {
    for (const row of (parked ?? []) as ParkedActivationRow[]) {
      const { data: alerted, error: alertError } = await admin
        .from('platform_payment_requests')
        .update({ activation_alerted_at: nowIso, updated_at: nowIso })
        .eq('request_id', row.request_id)
        .eq('activation_state', 'failed_retryable')
        .is('activation_alerted_at', null)
        .select('request_id')
        .maybeSingle()

      if (alertError) {
        result.errors++
        console.error(
          `[cron/reconcile-solana-platform-activations] failed to mark alert ${row.request_id}:`,
          alertError,
        )
        continue
      }
      if (!alerted) continue

      result.alerts++
      console.error(
        '[billing-alert]',
        JSON.stringify({
          type: 'solana_platform_activation_exhausted',
          requestId: row.request_id,
          tenantId: row.tenant_id,
          signature: row.provider_charge_id,
          attempts: row.activation_attempt_count,
          lastError: row.activation_last_error,
        }),
      )
    }
  }

  console.log('[cron/reconcile-solana-platform-activations]', JSON.stringify(result))
  return NextResponse.json(result)
}
