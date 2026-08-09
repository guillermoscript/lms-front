import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'

export const SOLANA_ACTIVATION_MAX_ATTEMPTS = 5
export const SOLANA_ACTIVATION_LEASE_SECONDS = 5 * 60
export const SOLANA_ACTIVATION_RETRY_SECONDS = 60

export type SolanaActivationState =
  | 'observed'
  | 'processing'
  | 'activated'
  | 'failed_retryable'
  | 'terminal_invalid'

interface ObservationRow {
  observation_status:
    | 'observed'
    | 'activated'
    | 'terminal_invalid'
    | 'signature_conflict'
    | 'signature_mismatch'
    | 'not_found'
  current_activation_state: SolanaActivationState | null
  current_signature: string | null
}

interface ClaimRow {
  claim_status:
    | 'claimed'
    | 'processing'
    | 'activated'
    | 'terminal_invalid'
    | 'retry_later'
    | 'attempts_exhausted'
    | 'not_found'
  current_activation_state: SolanaActivationState | null
  current_attempt_count: number
}

interface ActivationRequestRow {
  request_id: string
  tenant_id: string
  plan_id: string
  interval: string
  provider_charge_id: string
  switch_id: string | null
  platform_plans: { slug: string } | { slug: string }[] | null
}

export type ObserveSolanaPaymentResult =
  | { status: 'observed' | 'activated'; state: SolanaActivationState; signature: string }
  | {
      status: 'terminal_invalid' | 'signature_conflict' | 'signature_mismatch' | 'not_found'
      state: SolanaActivationState | null
      signature: string | null
    }

export interface ProcessSolanaActivationResult {
  state: SolanaActivationState
  attemptCount: number
  claimed: boolean
  alertRequired?: boolean
}

function rpcError(label: string, error: { message?: string }): Error {
  return new Error(`${label} failed: ${error.message ?? JSON.stringify(error)}`)
}

/** Atomically persist the verified signature before any entitlement work runs. */
export async function observeSolanaPlatformPayment(
  admin: SupabaseClient,
  requestId: string,
  tenantId: string,
  signature: string,
): Promise<ObserveSolanaPaymentResult> {
  const { data, error } = await admin.rpc('observe_solana_platform_payment', {
    _request_id: requestId,
    _tenant_id: tenantId,
    _signature: signature,
  })
  if (error) throw rpcError('Solana payment observation', error)

  const row = (data as ObservationRow[] | null)?.[0]
  if (!row) throw new Error('Solana payment observation returned no result')

  if (row.observation_status === 'observed' || row.observation_status === 'activated') {
    if (!row.current_activation_state || !row.current_signature) {
      throw new Error('Solana payment observation returned an incomplete success result')
    }
    return {
      status: row.observation_status,
      state: row.current_activation_state,
      signature: row.current_signature,
    }
  }

  return {
    status: row.observation_status,
    state: row.current_activation_state,
    signature: row.current_signature,
  }
}

/**
 * Lease and dispatch one observed payment.
 *
 * The dispatcher is replay-safe by signature. If this worker dies after the
 * entitlement commit but before completion, the next lease repeats the same
 * event without extending the paid period twice.
 */
export async function processSolanaPlatformActivation(
  admin: SupabaseClient,
  requestId: string,
): Promise<ProcessSolanaActivationResult> {
  const claimToken = randomUUID()
  const { data, error } = await admin.rpc('claim_solana_platform_activation', {
    _request_id: requestId,
    _claim_token: claimToken,
    _lease_seconds: SOLANA_ACTIVATION_LEASE_SECONDS,
    _max_attempts: SOLANA_ACTIVATION_MAX_ATTEMPTS,
  })
  if (error) throw rpcError('Solana activation claim', error)

  const claim = (data as ClaimRow[] | null)?.[0]
  if (!claim) throw new Error('Solana activation claim returned no result')

  if (claim.claim_status !== 'claimed') {
    const state = claim.current_activation_state ?? 'terminal_invalid'
    return {
      state,
      attemptCount: claim.current_attempt_count,
      claimed: false,
      ...(claim.claim_status === 'attempts_exhausted' ? { alertRequired: true } : {}),
    }
  }

  const { data: request, error: requestError } = await admin
    .from('platform_payment_requests')
    .select(
      'request_id, tenant_id, plan_id, interval, provider_charge_id, switch_id, platform_plans(slug)',
    )
    .eq('request_id', requestId)
    .eq('payment_provider', 'solana')
    .maybeSingle()

  try {
    if (requestError) throw rpcError('Solana activation request lookup', requestError)
    if (!request?.provider_charge_id) throw new Error('Observed Solana payment has no signature')

    const row = request as unknown as ActivationRequestRow
    const embeddedPlan = row.platform_plans
    const planSlug = (Array.isArray(embeddedPlan) ? embeddedPlan[0] : embeddedPlan)?.slug

    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.activated',
        providerEventId: row.provider_charge_id,
        providerPaymentId: row.provider_charge_id,
        providerSubscriptionId: row.provider_charge_id,
        metadata: {
          tenant_id: row.tenant_id,
          plan_id: row.plan_id,
          ...(planSlug ? { plan_slug: planSlug } : {}),
          interval: row.interval,
          ...(row.switch_id ? { billing_switch_id: row.switch_id } : {}),
        },
        raw: { requestId: row.request_id, signature: row.provider_charge_id },
      },
      { provider: 'solana', admin },
    )

    const { data: completed, error: completeError } = await admin.rpc(
      'complete_solana_platform_activation',
      { _request_id: requestId, _claim_token: claimToken },
    )
    if (completeError) throw rpcError('Solana activation completion', completeError)
    if (completed !== true) {
      throw new Error('Solana activation completion rejected: claim ownership lost')
    }

    return { state: 'activated', attemptCount: claim.current_attempt_count, claimed: true }
  } catch (activationError) {
    const message = activationError instanceof Error ? activationError.message : String(activationError)
    const { data: failureState, error: failError } = await admin.rpc(
      'fail_solana_platform_activation',
      {
        _request_id: requestId,
        _claim_token: claimToken,
        _last_error: message,
        _retry_delay_seconds: SOLANA_ACTIVATION_RETRY_SECONDS,
        _max_attempts: SOLANA_ACTIVATION_MAX_ATTEMPTS,
      },
    )

    if (failError) {
      console.error('[billing/solana/activation] failed to release activation lease:', failError)
    }
    console.error(`[billing/solana/activation] attempt failed for ${requestId}:`, activationError)

    const ownershipLost = failureState === 'ownership_lost'
    const exhausted = failureState === 'attempts_exhausted'
    return {
      state: ownershipLost ? 'processing' : 'failed_retryable',
      attemptCount: claim.current_attempt_count,
      claimed: true,
      ...(exhausted ? { alertRequired: true } : {}),
    }
  }
}
