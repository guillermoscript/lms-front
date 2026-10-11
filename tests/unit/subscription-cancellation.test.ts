import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applySubscriptionCancellation, cancelProviderSubscription, resumeProviderSubscription } from '@/lib/payments/subscription-cancellation'
import { cancelIsFinalAtProvider, PROVIDER_CAPABILITIES, type CancellationResult, type IPaymentProvider } from '@/lib/payments/types'

describe('shared paid-access cancellation contract', () => {
  it.each([
    ['stripe', { mode: 'period_end', effectiveAt: new Date('2030-01-01T00:00:00Z') }],
    ['solana_subs', { mode: 'period_end', effectiveAt: new Date('2030-01-01T00:00:00Z') }],
    ['paypal', { mode: 'immediate' }],
  ] satisfies [string, CancellationResult][])('%s provider billing cancellation preserves paid access', async (_provider, result) => {
    const rpc = vi.fn().mockResolvedValue({ data: '2030-01-01T00:00:00Z', error: null })
    await applySubscriptionCancellation({ rpc } as unknown as SupabaseClient, 1, { result })
    expect(rpc).toHaveBeenCalledWith('apply_subscription_cancellation', {
      _subscription_id: 1, _immediate: false,
      _provider_deadline: result.mode === 'period_end' ? '2030-01-01T00:00:00.000Z' : null,
    })
  })
  it('explicit immediate termination is distinct from provider finality', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    await applySubscriptionCancellation({ rpc } as unknown as SupabaseClient, 1, { immediate: true })
    expect(rpc).toHaveBeenCalledWith('apply_subscription_cancellation', expect.objectContaining({ _immediate: true }))
  })
  it('cannot report cancellation persistence success when storage fails', async () => {
    const rpc = vi.fn().mockResolvedValue({error: new Error('write failed')})
    await expect(applySubscriptionCancellation({rpc} as unknown as SupabaseClient,1)).rejects.toThrow('write failed')
  })
  it('capabilities keep resumable Stripe cancellation distinct from final PayPal and delegation revocation', () => {
    expect(cancelIsFinalAtProvider('stripe')).toBe(false)
    expect(cancelIsFinalAtProvider('paypal')).toBe(true)
    expect(cancelIsFinalAtProvider('solana_subs')).toBe(true)
  })
})

describe('adapter subscription capability contract', () => {
  function adapter(provider: 'stripe' | 'paypal' | 'solana_subs' | 'manual', methods: Partial<IPaymentProvider> = {}) {
    return { provider, capabilities: PROVIDER_CAPABILITIES[provider], ...methods } as IPaymentProvider
  }
  it('does not silently skip cancellation on a future native adapter', async () => {
    await expect(cancelProviderSubscription(adapter('stripe'), 'sub', false)).rejects.toThrow('does not implement')
  })
  it('does not accept a no-op as proof that native billing stopped', async () => {
    await expect(cancelProviderSubscription(adapter('stripe', {
      cancelSubscription: vi.fn().mockResolvedValue({ mode: 'none' }),
    }), 'sub', false)).rejects.toThrow('did not confirm')
  })
  it('passes the explicit immediate request and provider deadline through unchanged', async () => {
    const result: CancellationResult = { mode: 'period_end', effectiveAt: new Date('2030-01-01') }
    const cancelSubscription = vi.fn().mockResolvedValue(result)
    expect(await cancelProviderSubscription(adapter('stripe', { cancelSubscription }), 'sub', true)).toBe(result)
    expect(cancelSubscription).toHaveBeenCalledWith('sub', true)
  })
  it('does not silently resume when the native adapter method is missing', async () => {
    await expect(resumeProviderSubscription(adapter('stripe'), 'sub')).rejects.toThrow('does not implement')
  })
  it.each(['paypal', 'solana_subs'] as const)('rejects final %s resume even when a method exists', async provider => {
    const reactivateSubscription = vi.fn()
    await expect(resumeProviderSubscription(adapter(provider, { reactivateSubscription }), 'sub')).rejects.toThrow('final')
    expect(reactivateSubscription).not.toHaveBeenCalled()
  })
  it('allows a manual adapter to omit remote subscription operations', async () => {
    expect(await cancelProviderSubscription(adapter('manual'), 'sub', false)).toEqual({ mode: 'none' })
    await expect(resumeProviderSubscription(adapter('manual'), 'sub')).resolves.toBeUndefined()
  })
})
