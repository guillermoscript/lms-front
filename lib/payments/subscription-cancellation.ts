import type { SupabaseClient } from '@supabase/supabase-js'
import type { CancellationResult, IPaymentProvider } from './types'

/** Optional methods are only optional for adapters without native billing. */
export async function cancelProviderSubscription(
  provider: IPaymentProvider,
  subscriptionId: string,
  immediate: boolean,
): Promise<CancellationResult> {
  if (!provider.cancelSubscription) {
    if (provider.capabilities.supportsNativeSubscriptions) {
      throw new Error('Payment provider does not implement subscription cancellation')
    }
    return { mode: 'none' }
  }
  const result = await provider.cancelSubscription(subscriptionId, immediate)
  if (result.mode === 'none' && provider.capabilities.supportsNativeSubscriptions) {
    throw new Error('Payment provider did not confirm billing cancellation')
  }
  return result
}

export async function resumeProviderSubscription(
  provider: IPaymentProvider,
  subscriptionId: string,
): Promise<void> {
  if (provider.capabilities.supportsNativeSubscriptions
    && !provider.capabilities.supportsScheduledCancellation) {
    throw new Error('Cancellation is final at the payment provider')
  }
  if (!provider.reactivateSubscription) {
    if (provider.capabilities.supportsNativeSubscriptions) {
      throw new Error('Payment provider does not implement subscription reactivation')
    }
    return
  }
  await provider.reactivateSubscription(subscriptionId)
}

/** Provider cancellation stops billing; only explicit app termination ends paid
 * access immediately. A provider's `immediate` result (e.g. PayPal) is billing
 * finality, not permission to discard the period the student already paid for.
 */
export async function applySubscriptionCancellation(
  admin: SupabaseClient,
  subscriptionId: number,
  options: { immediate?: boolean; result?: CancellationResult } = {},
): Promise<string | null> {
  const { data, error } = await admin.rpc('apply_subscription_cancellation', {
    _subscription_id: subscriptionId,
    _immediate: options.immediate === true,
    _provider_deadline: options.result?.mode === 'period_end'
      ? options.result.effectiveAt?.toISOString() ?? null : null,
  })
  if (error) throw error
  if (data !== null && typeof data !== 'string') {
    throw new Error('Invalid subscription cancellation deadline returned')
  }
  return data
}
