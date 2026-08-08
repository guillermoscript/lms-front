import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, type Db } from './support/fake-supabase'

const providerState: {
  result: { mode: 'none' | 'immediate' | 'period_end'; effectiveAt?: Date }
  error: Error | null
  calls: { id: string; immediate: boolean }[]
} = {
  result: { mode: 'immediate' },
  error: null,
  calls: [],
}

vi.mock('@/lib/billing/platform-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-billing')>()
  return {
    ...actual,
    getPlatformBillingProvider: () => ({
      cancelSubscription: (id: string, immediate: boolean) => {
        providerState.calls.push({ id, immediate })
        if (providerState.error) return Promise.reject(providerState.error)
        return Promise.resolve(providerState.result)
      },
    }),
  }
})

vi.mock('@/lib/billing/downgrade-tenant', () => ({
  downgradeTenantToFreeIfCurrent: vi.fn(() => Promise.resolve(10)),
}))

import {
  reconcilePlatformSubscriptionSwitch,
} from '@/lib/billing/platform-subscription-switch'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'
import { downgradeTenantToFreeIfCurrent } from '@/lib/billing/downgrade-tenant'

const TENANT = '00000000-0000-0000-0000-000000000001'

function switchRow(over: Record<string, unknown> = {}) {
  return {
    switch_id: 'switch-1',
    tenant_id: TENANT,
    source_payment_provider: 'stripe',
    source_provider_subscription_id: 'sub-old',
    source_period_end: '2026-09-01T00:00:00.000Z',
    target_payment_provider: 'lemonsqueezy',
    target_provider_subscription_id: 'sub-new',
    state: 'cancellation_pending',
    cancel_attempts: 0,
    next_retry_at: '2026-08-08T00:00:00.000Z',
    ...over,
  }
}

function setup(over: { current?: Record<string, unknown>; switch?: Record<string, unknown> } = {}) {
  const db: Db = {
    platform_subscriptions: over.current ? [over.current] : [],
    platform_subscription_switches: over.switch ? [over.switch] : [],
  }
  const fake = createFakeSupabase(db)
  return { db, admin: fake.client as unknown as SupabaseClient, writes: fake.writes }
}

beforeEach(() => {
  providerState.result = { mode: 'immediate' }
  providerState.error = null
  providerState.calls = []
  vi.mocked(downgradeTenantToFreeIfCurrent).mockClear()
})

describe('source cancellation reconciliation', () => {
  it('marks an immediate source cancellation completed after target activation', async () => {
    const { db, admin } = setup({ switch: switchRow() })
    await expect(reconcilePlatformSubscriptionSwitch(admin, 'switch-1')).resolves.toBe('completed')
    expect(providerState.calls).toEqual([{ id: 'sub-old', immediate: true }])
    expect(db.platform_subscription_switches[0]).toMatchObject({
      state: 'completed',
      source_cancel_mode: 'immediate',
      cancel_attempts: 1,
      last_error: null,
    })
  })

  it('records Lemon Squeezy period-end semantics instead of claiming immediate cancellation', async () => {
    providerState.result = { mode: 'period_end', effectiveAt: new Date('2026-09-01T00:00:00.000Z') }
    const { db, admin } = setup({
      switch: switchRow({ source_payment_provider: 'lemonsqueezy' }),
    })
    await expect(reconcilePlatformSubscriptionSwitch(admin, 'switch-1')).resolves.toBe('scheduled')
    expect(db.platform_subscription_switches[0]).toMatchObject({
      state: 'cancellation_scheduled',
      source_cancel_mode: 'period_end',
      source_cancel_effective_at: '2026-09-01T00:00:00.000Z',
    })
  })

  it('keeps replacement entitlement and schedules retry when source cancellation fails', async () => {
    providerState.error = new Error('provider unavailable')
    const current = {
      tenant_id: TENANT,
      payment_provider: 'lemonsqueezy',
      provider_subscription_id: 'sub-new',
      status: 'active',
    }
    const { db, admin } = setup({ current, switch: switchRow() })
    await expect(reconcilePlatformSubscriptionSwitch(admin, 'switch-1')).resolves.toBe('retry')
    expect(db.platform_subscriptions[0]).toEqual(current)
    expect(db.platform_subscription_switches[0]).toMatchObject({
      state: 'cancellation_retry',
      cancel_attempts: 1,
      last_error: 'provider unavailable',
    })
  })

  it('does not infer already-canceled from provider error message text', async () => {
    providerState.error = new Error('HTTP 422 — Store not found for this API key')
    const { db, admin } = setup({ switch: switchRow({ source_payment_provider: 'lemonsqueezy' }) })

    await expect(reconcilePlatformSubscriptionSwitch(admin, 'switch-1')).resolves.toBe('retry')
    expect(db.platform_subscription_switches[0]).toMatchObject({
      state: 'cancellation_retry',
      last_error: 'HTTP 422 — Store not found for this API key',
    })
  })
})

describe('webhook identity scoping', () => {
  it('downgrades only an exact current provider/subscription identity', async () => {
    const { admin } = setup({
      current: {
        tenant_id: TENANT,
        payment_provider: 'stripe',
        provider_subscription_id: 'sub-current',
        status: 'active',
      },
    })
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.canceled',
        providerSubscriptionId: 'sub-current',
        metadata: { tenant_id: TENANT },
        raw: {},
      },
      { provider: 'stripe', admin },
    )
    expect(downgradeTenantToFreeIfCurrent).toHaveBeenCalledWith(
      admin,
      TENANT,
      'stripe',
      'sub-current',
    )
  })

  it('records a delayed source terminal event without downgrading the replacement', async () => {
    const current = {
      tenant_id: TENANT,
      payment_provider: 'lemonsqueezy',
      provider_subscription_id: 'sub-new',
      status: 'active',
    }
    const { db, admin } = setup({ current, switch: switchRow({ state: 'cancellation_scheduled' }) })
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.expired',
        providerSubscriptionId: 'sub-old',
        metadata: { tenant_id: TENANT },
        raw: {},
      },
      { provider: 'stripe', admin },
    )
    expect(downgradeTenantToFreeIfCurrent).not.toHaveBeenCalled()
    expect(db.platform_subscriptions[0]).toEqual(current)
    expect(db.platform_subscription_switches[0].state).toBe('completed')
  })

  it('ignores a late nonterminal event from the superseded source', async () => {
    const current = {
      tenant_id: TENANT,
      plan_id: 'plan-new',
      payment_provider: 'lemonsqueezy',
      provider_subscription_id: 'sub-new',
      current_period_end: '2026-10-01T00:00:00.000Z',
      status: 'active',
    }
    const { db, admin } = setup({ current, switch: switchRow() })
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.past_due',
        providerSubscriptionId: 'sub-old',
        metadata: { tenant_id: TENANT },
        raw: {},
      },
      { provider: 'stripe', admin },
    )
    expect(db.platform_subscriptions[0]).toEqual(current)
  })

  it('does not treat a stale cross-provider activation as fresh while current is past due', async () => {
    const current = {
      tenant_id: TENANT,
      plan_id: 'plan-new',
      payment_provider: 'lemonsqueezy',
      provider_subscription_id: 'sub-new',
      current_period_end: '2026-10-01T00:00:00.000Z',
      status: 'past_due',
    }
    const { db, admin } = setup({ current })
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.activated',
        providerSubscriptionId: 'sub-old',
        metadata: { tenant_id: TENANT, plan_id: 'plan-old', interval: 'monthly' },
        raw: {},
      },
      { provider: 'stripe', admin },
    )
    expect(db.platform_subscriptions[0]).toEqual(current)
  })

  it('unknown old terminal identity is an audited no-op', async () => {
    const current = {
      tenant_id: TENANT,
      payment_provider: 'lemonsqueezy',
      provider_subscription_id: 'sub-new',
      status: 'active',
    }
    const { db, admin } = setup({ current })
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.canceled',
        providerSubscriptionId: 'sub-unknown',
        metadata: { tenant_id: TENANT },
        raw: {},
      },
      { provider: 'stripe', admin },
    )
    expect(downgradeTenantToFreeIfCurrent).not.toHaveBeenCalled()
    expect(db.platform_subscriptions[0]).toEqual(current)
  })
})
