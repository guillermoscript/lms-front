import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * #950 — a platform-FEE Solana request rides the same observe → lease →
 * complete workflow as a plan request, but stage 2 credits the pending
 * `platform_fee_payments` row (`settle_platform_fee_payment`) instead of
 * activating a plan. `duplicate` is a success (a reclaimed lease replays the
 * same signature); anything else leaves money uncredited and must retry/alert.
 */

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  settleOutcome: 'settled' as string,
  settleError: null as null | { message: string },
  complete: true,
  queue: [] as { request_id: string }[],
  parked: [] as Record<string, unknown>[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  selects: [] as string[],
  dispatch: vi.fn(),
}))

vi.mock('@/lib/billing/platform-webhook-dispatch', () => ({
  dispatchPlatformBillingEvent: state.dispatch,
}))

function fakeAdmin() {
  return {
    from: () => {
      let isUpdate = false
      let isQueueScan = false
      const b: Record<string, unknown> = {}
      for (const m of ['eq', 'in', 'lt', 'gte', 'order', 'limit', 'is']) b[m] = () => b
      b.select = (cols: string) => {
        state.selects.push(cols)
        return b
      }
      b.or = () => {
        isQueueScan = true
        return b
      }
      b.update = () => {
        isUpdate = true
        return b
      }
      b.maybeSingle = () =>
        Promise.resolve({ data: isUpdate ? { request_id: 'alerted' } : state.row, error: null })
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: isUpdate ? null : isQueueScan ? state.queue : state.parked, error: null }).then(
          resolve,
        )
      return b
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      if (name === 'claim_solana_platform_activation') {
        return Promise.resolve({
          data: [{ claim_status: 'claimed', current_activation_state: 'processing', current_attempt_count: 1 }],
          error: null,
        })
      }
      if (name === 'settle_platform_fee_payment') {
        return Promise.resolve({ data: state.settleError ? null : state.settleOutcome, error: state.settleError })
      }
      if (name === 'complete_solana_platform_activation') return Promise.resolve({ data: state.complete, error: null })
      if (name === 'fail_solana_platform_activation') return Promise.resolve({ data: 'failed_retryable', error: null })
      return Promise.resolve({ data: null, error: { message: `Unexpected RPC ${name}` } })
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeAdmin() }))

import { processSolanaPlatformActivation } from '@/lib/billing/solana-platform-activation'
import { GET } from '@/app/api/cron/reconcile-solana-platform-activations/route'

const feeRow = () => ({
  request_id: 'req-fee',
  tenant_id: 'tenant-950',
  plan_id: null,
  fee_payment_id: 'pay-950',
  request_type: 'fee',
  interval: null,
  provider_charge_id: 'sig-950',
  switch_id: null,
  amount: '12.50',
  currency: 'usd',
  platform_plans: null,
})

const rpcNames = () => state.rpcCalls.map((c) => c.name)

beforeEach(() => {
  state.row = feeRow()
  state.settleOutcome = 'settled'
  state.settleError = null
  state.complete = true
  state.queue = []
  state.parked = []
  state.rpcCalls = []
  state.selects = []
  state.dispatch.mockReset()
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('processSolanaPlatformActivation: fee branch', () => {
  it('reads the fee columns and settles the ledger row with the USD amount and signature', async () => {
    const result = await processSolanaPlatformActivation(fakeAdmin() as unknown as SupabaseClient, 'req-fee')

    expect(result).toEqual({ state: 'activated', attemptCount: 1, claimed: true })
    expect(state.selects[0]).toContain('fee_payment_id')
    expect(state.selects[0]).toContain('request_type')
    const settle = state.rpcCalls.find((c) => c.name === 'settle_platform_fee_payment')
    expect(settle?.args).toEqual({
      _payment_id: 'pay-950',
      _tenant_id: 'tenant-950',
      _provider: 'solana',
      _provider_charge_id: 'sig-950',
      _amount: 12.5,
      _currency: 'USD',
    })
    expect(rpcNames()).toContain('complete_solana_platform_activation')
    // Never the plan path: no subscription.activated for a fee row.
    expect(state.dispatch).not.toHaveBeenCalled()
  })

  it('treats a duplicate settle (replayed signature) as success', async () => {
    state.settleOutcome = 'duplicate'

    const result = await processSolanaPlatformActivation(fakeAdmin() as unknown as SupabaseClient, 'req-fee')

    expect(result.state).toBe('activated')
    expect(rpcNames()).toContain('complete_solana_platform_activation')
    expect(rpcNames()).not.toContain('fail_solana_platform_activation')
  })

  it.each(['mismatch', 'not_pending', 'not_found'])(
    'a %s outcome is not a credit: the lease fails (retry, then alert) and the request stays open',
    async (outcome) => {
      state.settleOutcome = outcome

      const result = await processSolanaPlatformActivation(fakeAdmin() as unknown as SupabaseClient, 'req-fee')

      expect(result.state).toBe('failed_retryable')
      expect(rpcNames()).not.toContain('complete_solana_platform_activation')
      const fail = state.rpcCalls.find((c) => c.name === 'fail_solana_platform_activation')
      expect(String(fail?.args._last_error)).toContain(outcome)
    },
  )

  it('a settle RPC error is retryable, never a completion', async () => {
    state.settleError = { message: 'db down' }

    const result = await processSolanaPlatformActivation(fakeAdmin() as unknown as SupabaseClient, 'req-fee')

    expect(result.state).toBe('failed_retryable')
    expect(rpcNames()).not.toContain('complete_solana_platform_activation')
  })

  it('a plan row still activates through the dispatcher, untouched', async () => {
    state.row = {
      ...feeRow(),
      plan_id: 'plan-1',
      fee_payment_id: null,
      request_type: 'upgrade',
      interval: 'monthly',
      platform_plans: { slug: 'starter' },
    }

    const result = await processSolanaPlatformActivation(fakeAdmin() as unknown as SupabaseClient, 'req-fee')

    expect(result.state).toBe('activated')
    expect(rpcNames()).not.toContain('settle_platform_fee_payment')
    expect(state.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscription.activated',
        metadata: expect.objectContaining({ plan_id: 'plan-1', plan_slug: 'starter', interval: 'monthly' }),
      }),
      expect.objectContaining({ provider: 'solana' }),
    )
  })
})

describe('cron: reconcile Solana platform activations — fee rows', () => {
  const cronRequest = () =>
    ({ headers: { get: () => 'Bearer cron-secret' } }) as unknown as NextRequest

  it('settles a queued fee row through the fee ledger, not plan activation (no throw on null plan_id)', async () => {
    state.queue = [{ request_id: 'req-fee' }]

    const body = await (await GET(cronRequest())).json()

    expect(body).toMatchObject({ scanned: 1, activated: 1, failed: 0, errors: 0 })
    expect(rpcNames()).toContain('settle_platform_fee_payment')
    expect(state.dispatch).not.toHaveBeenCalled()
  })

  it('labels a parked fee row as a fee in the alert', async () => {
    state.parked = [
      {
        request_id: 'req-fee',
        tenant_id: 'tenant-950',
        fee_payment_id: 'pay-950',
        provider_charge_id: 'sig-950',
        activation_attempt_count: 5,
        activation_last_error: 'Solana fee payment pay-950 not credited: mismatch',
      },
    ]

    const body = await (await GET(cronRequest())).json()

    expect(body.alerts).toBe(1)
    const alert = vi
      .mocked(console.error)
      .mock.calls.find((c) => c[0] === '[billing-alert]')?.[1] as string
    expect(JSON.parse(alert)).toMatchObject({ kind: 'fee', feePaymentId: 'pay-950', requestId: 'req-fee' })
  })
})
