import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlatformBillingProvider } from '@/lib/billing/platform-billing'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import type { CancellationResult, PaymentProvider } from '@/lib/payments/types'

export const SWITCH_METADATA_KEY = 'billing_switch_id'

export class SwitchAlreadyPendingError extends Error {
  constructor() {
    super('A payment-method switch is already pending for this school.')
  }
}

interface BeginSwitchParams {
  admin: SupabaseClient
  tenantId: string
  targetPlanId: string
  targetProvider: PaymentProvider
  targetInterval: 'monthly' | 'yearly'
  initiatedBy: string
  expiresAt?: string
}

/**
 * Snapshot the current entitlement without mutating it. The partial unique
 * index is the concurrency guard: two checkout requests cannot mint two open
 * replacement subscriptions for one tenant.
 */
export async function beginPlatformSubscriptionSwitch(
  params: BeginSwitchParams,
): Promise<string | null> {
  const { admin, tenantId, targetPlanId, targetProvider, targetInterval, initiatedBy } = params
  const { data: source, error: sourceError } = await admin
    .from('platform_subscriptions')
    .select('subscription_id, plan_id, payment_provider, provider_subscription_id, current_period_end, status')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (sourceError) throw new Error(`Failed to read current subscription: ${sourceError.message}`)
  if (!source || source.status !== 'active' || source.payment_provider === targetProvider) return null

  const switchId = crypto.randomUUID()
  const { data, error } = await admin
    .from('platform_subscription_switches')
    .insert({
      switch_id: switchId,
      tenant_id: tenantId,
      source_subscription_id: source.subscription_id,
      source_plan_id: source.plan_id,
      source_payment_provider: source.payment_provider,
      source_provider_subscription_id: source.provider_subscription_id,
      source_period_end: source.current_period_end,
      target_plan_id: targetPlanId,
      target_payment_provider: targetProvider,
      target_interval: targetInterval,
      initiated_by: initiatedBy,
      ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
    })
    .select('switch_id')
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') throw new SwitchAlreadyPendingError()
    throw new Error(`Failed to record subscription switch: ${error.message}`)
  }
  return data.switch_id ?? switchId
}

export async function attachSwitchCheckoutReference(
  admin: SupabaseClient,
  switchId: string | null,
  reference: string | undefined,
  expiresAt?: Date,
): Promise<void> {
  if (!switchId || !reference) return
  const { error } = await admin
    .from('platform_subscription_switches')
    .update({
      target_checkout_reference: reference,
      ...(expiresAt ? { expires_at: expiresAt.toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('switch_id', switchId)
    .eq('state', 'pending_activation')
  if (error) throw new Error(`Failed to attach replacement checkout: ${error.message}`)
}

async function closePendingPlatformSubscriptionSwitch(
  admin: SupabaseClient,
  switchId: string | null,
  state: 'failed' | 'abandoned',
  reason: unknown,
): Promise<void> {
  if (!switchId) return
  const { error } = await admin
    .from('platform_subscription_switches')
    .update({
      state,
      last_error: reason instanceof Error ? reason.message : String(reason),
      updated_at: new Date().toISOString(),
    })
    .eq('switch_id', switchId)
    .eq('state', 'pending_activation')
  if (error) throw new Error(`Failed to close subscription switch: ${error.message}`)
}

export function failPlatformSubscriptionSwitch(
  admin: SupabaseClient,
  switchId: string | null,
  reason: unknown,
): Promise<void> {
  return closePendingPlatformSubscriptionSwitch(admin, switchId, 'failed', reason)
}

export function abandonPlatformSubscriptionSwitch(
  admin: SupabaseClient,
  switchId: string | null,
  reason: unknown,
): Promise<void> {
  return closePendingPlatformSubscriptionSwitch(admin, switchId, 'abandoned', reason)
}

export interface PromoteSwitchParams {
  admin: SupabaseClient
  switchId: string
  tenantId: string
  targetProvider: PaymentProvider
  targetProviderSubscriptionId: string | null
  targetProviderCustomerId: string | null
  targetPlanId: string
  targetStatus: string
  targetInterval: 'monthly' | 'yearly'
  targetPeriodStart: string | null
  targetPeriodEnd: string | null
}

/** Atomically replace current entitlement and move source cleanup to retryable state. */
export async function promotePlatformSubscriptionSwitch(params: PromoteSwitchParams): Promise<boolean> {
  const { data, error } = await params.admin.rpc('promote_platform_subscription_switch', {
    _switch_id: params.switchId,
    _tenant_id: params.tenantId,
    _target_payment_provider: params.targetProvider,
    _target_provider_subscription_id: params.targetProviderSubscriptionId,
    _target_provider_customer_id: params.targetProviderCustomerId,
    _target_plan_id: params.targetPlanId,
    _target_status: params.targetStatus,
    _target_interval: params.targetInterval,
    _target_period_start: params.targetPeriodStart,
    _target_period_end: params.targetPeriodEnd,
  })
  if (error) throw new Error(`Failed to promote subscription switch: ${error.message}`)
  return data === true
}

type SwitchCleanupRow = {
  switch_id: string
  source_payment_provider: string
  source_provider_subscription_id: string | null
  source_period_end: string | null
  state: string
  cancel_attempts: number
}

async function updateCleanupFailure(admin: SupabaseClient, row: SwitchCleanupRow, error: unknown) {
  const attempt = row.cancel_attempts + 1
  const delayMinutes = Math.min(2 ** Math.min(attempt, 8), 240)
  const nextRetry = new Date(Date.now() + delayMinutes * 60_000).toISOString()
  const { error: writeError } = await admin
    .from('platform_subscription_switches')
    .update({
      state: 'cancellation_retry',
      cancel_attempts: attempt,
      last_error: error instanceof Error ? error.message : String(error),
      next_retry_at: nextRetry,
      updated_at: new Date().toISOString(),
    })
    .eq('switch_id', row.switch_id)
  if (writeError) throw new Error(`Failed to persist cancellation retry: ${writeError.message}`)
}

/**
 * Cancel source only after replacement promotion. Failure never rolls back the
 * paid target; it leaves a durable retry record for the reconciler.
 */
export async function reconcilePlatformSubscriptionSwitch(
  admin: SupabaseClient,
  switchId: string,
): Promise<'completed' | 'scheduled' | 'retry' | 'ignored'> {
  const { data, error } = await admin
    .from('platform_subscription_switches')
    .select('switch_id, source_payment_provider, source_provider_subscription_id, source_period_end, state, cancel_attempts')
    .eq('switch_id', switchId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load subscription switch: ${error.message}`)
  const row = data as SwitchCleanupRow | null
  if (!row || !['cancellation_pending', 'cancellation_retry'].includes(row.state)) return 'ignored'

  const provider = row.source_payment_provider as PaymentProvider
  const caps = PROVIDER_CAPABILITIES[provider]
  const now = new Date().toISOString()

  if (!caps?.supportsNativeSubscriptions || !row.source_provider_subscription_id) {
    const { error: completeError } = await admin
      .from('platform_subscription_switches')
      .update({
        state: 'completed',
        source_cancel_mode: 'none',
        completed_at: now,
        next_retry_at: null,
        last_error: null,
        updated_at: now,
      })
      .eq('switch_id', switchId)
    if (completeError) throw new Error(`Failed to complete local-only switch: ${completeError.message}`)
    return 'completed'
  }

  try {
    const paymentProvider = getPlatformBillingProvider(provider)
    if (!paymentProvider.cancelSubscription) {
      throw new Error(`${provider} does not expose subscription cancellation`)
    }
    const result: CancellationResult = await paymentProvider.cancelSubscription(
      row.source_provider_subscription_id,
      true,
    )
    const scheduled = result.mode === 'period_end'
    const { error: resultError } = await admin
      .from('platform_subscription_switches')
      .update({
        state: scheduled ? 'cancellation_scheduled' : 'completed',
        source_cancel_mode: result.mode,
        source_cancel_effective_at:
          result.effectiveAt?.toISOString() ?? (scheduled ? row.source_period_end : now),
        cancel_attempts: row.cancel_attempts + 1,
        completed_at: scheduled ? null : now,
        next_retry_at: null,
        last_error: null,
        updated_at: now,
      })
      .eq('switch_id', switchId)
    if (resultError) throw new Error(`Failed to persist source cancellation result: ${resultError.message}`)
    return scheduled ? 'scheduled' : 'completed'
  } catch (cleanupError) {
    await updateCleanupFailure(admin, row, cleanupError)
    console.error(`[billing/switch] source cancellation failed for ${switchId}:`, cleanupError)
    return 'retry'
  }
}

/** A delayed source terminal event completes cleanup but never touches entitlement. */
export async function recordSupersededTerminalEvent(
  admin: SupabaseClient,
  provider: string,
  providerSubscriptionId: string,
): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('platform_subscription_switches')
    .update({
      state: 'completed',
      source_cancel_effective_at: now,
      completed_at: now,
      next_retry_at: null,
      last_error: null,
      updated_at: now,
    })
    .eq('source_payment_provider', provider)
    .eq('source_provider_subscription_id', providerSubscriptionId)
    .in('state', ['cancellation_pending', 'cancellation_retry', 'cancellation_scheduled'])
    .select('switch_id')
    .maybeSingle()
  if (error) throw new Error(`Failed to record superseded terminal event: ${error.message}`)
  return !!data
}

export function switchIdFromMetadata(metadata: Record<string, string> | undefined): string | null {
  return metadata?.[SWITCH_METADATA_KEY] ?? null
}

export async function isCurrentPlatformSubscriptionIdentity(
  admin: SupabaseClient,
  tenantId: string,
  provider: string,
  providerSubscriptionId: string | undefined,
): Promise<boolean> {
  if (!providerSubscriptionId) return false
  const { data, error } = await admin
    .from('platform_subscriptions')
    .select('subscription_id')
    .eq('tenant_id', tenantId)
    .eq('payment_provider', provider)
    .eq('provider_subscription_id', providerSubscriptionId)
    .maybeSingle()
  if (error) throw new Error(`Failed to check current subscription identity: ${error.message}`)
  return !!data
}
