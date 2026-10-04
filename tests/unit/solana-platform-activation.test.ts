import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const dispatch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/billing/platform-webhook-dispatch', () => ({
  dispatchPlatformBillingEvent: dispatch,
}))

import {
  observeSolanaPlatformPayment,
  processSolanaPlatformActivation,
} from '@/lib/billing/solana-platform-activation'

interface FakeState {
  claimStatus:
    | 'claimed'
    | 'processing'
    | 'activated'
    | 'terminal_invalid'
    | 'retry_later'
    | 'attempts_exhausted'
    | 'not_found'
  activationState: 'observed' | 'processing' | 'activated' | 'failed_retryable' | 'terminal_invalid'
  attemptCount: number
  observationStatus:
    | 'observed'
    | 'activated'
    | 'terminal_invalid'
    | 'signature_conflict'
    | 'signature_mismatch'
    | 'not_found'
  complete: boolean
  failureState: 'failed_retryable' | 'attempts_exhausted' | 'ownership_lost'
  rpcCalls: { name: string; args: Record<string, unknown> }[]
}

const state: FakeState = {
  claimStatus: 'claimed',
  activationState: 'processing',
  attemptCount: 1,
  observationStatus: 'observed',
  complete: true,
  failureState: 'failed_retryable',
  rpcCalls: [],
}

const requestRow = {
  request_id: 'request-622',
  tenant_id: 'tenant-622',
  plan_id: 'plan-622',
  interval: 'monthly',
  provider_charge_id: 'signature-622',
  switch_id: null,
  platform_plans: { slug: 'starter' },
}

function adminClient(): SupabaseClient {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.maybeSingle = () => Promise.resolve({ data: requestRow, error: null })

  return {
    from: () => builder,
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      if (name === 'observe_solana_platform_payment') {
        return Promise.resolve({
          data: [
            {
              observation_status: state.observationStatus,
              current_activation_state:
                state.observationStatus === 'not_found' ? null : state.activationState,
              current_signature:
                state.observationStatus === 'not_found' ? null : requestRow.provider_charge_id,
            },
          ],
          error: null,
        })
      }
      if (name === 'claim_solana_platform_activation') {
        return Promise.resolve({
          data: [
            {
              claim_status: state.claimStatus,
              current_activation_state: state.activationState,
              current_attempt_count: state.attemptCount,
            },
          ],
          error: null,
        })
      }
      if (name === 'complete_solana_platform_activation') {
        return Promise.resolve({ data: state.complete, error: null })
      }
      if (name === 'fail_solana_platform_activation') {
        return Promise.resolve({ data: state.failureState, error: null })
      }
      return Promise.resolve({ data: null, error: { message: `Unexpected RPC ${name}` } })
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  state.claimStatus = 'claimed'
  state.activationState = 'processing'
  state.attemptCount = 1
  state.observationStatus = 'observed'
  state.complete = true
  state.failureState = 'failed_retryable'
  state.rpcCalls = []
  dispatch.mockReset()
})

describe('Solana platform payment observation', () => {
  it('persists the verified signature through the observation RPC', async () => {
    const result = await observeSolanaPlatformPayment(
      adminClient(),
      requestRow.request_id,
      requestRow.tenant_id,
      requestRow.provider_charge_id,
    )

    expect(result).toEqual({
      status: 'observed',
      state: 'processing',
      signature: requestRow.provider_charge_id,
    })
    expect(state.rpcCalls[0]).toEqual({
      name: 'observe_solana_platform_payment',
      args: {
        _request_id: requestRow.request_id,
        _tenant_id: requestRow.tenant_id,
        _signature: requestRow.provider_charge_id,
      },
    })
  })

  it('surfaces a signature conflict as terminal invalidity', async () => {
    state.observationStatus = 'signature_conflict'
    state.activationState = 'terminal_invalid'

    await expect(
      observeSolanaPlatformPayment(
        adminClient(),
        requestRow.request_id,
        requestRow.tenant_id,
        requestRow.provider_charge_id,
      ),
    ).resolves.toMatchObject({ status: 'signature_conflict', state: 'terminal_invalid' })
  })
})

describe('Solana platform entitlement activation', () => {
  it('dispatches and completes only while owning the activation lease', async () => {
    const result = await processSolanaPlatformActivation(adminClient(), requestRow.request_id)

    expect(result).toEqual({ state: 'activated', attemptCount: 1, claimed: true })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscription.activated',
        providerEventId: requestRow.provider_charge_id,
        providerSubscriptionId: requestRow.provider_charge_id,
        metadata: expect.objectContaining({
          tenant_id: requestRow.tenant_id,
          plan_id: requestRow.plan_id,
          plan_slug: 'starter',
        }),
      }),
      expect.objectContaining({ provider: 'solana' }),
    )
    expect(state.rpcCalls.map((call) => call.name)).toEqual([
      'claim_solana_platform_activation',
      'complete_solana_platform_activation',
    ])
    expect(state.rpcCalls[1].args._claim_token).toBe(state.rpcCalls[0].args._claim_token)
  })

  it('records a retryable failure after the payment is already observed', async () => {
    dispatch.mockRejectedValueOnce(new Error('injected activation failure'))

    const result = await processSolanaPlatformActivation(adminClient(), requestRow.request_id)

    expect(result).toEqual({ state: 'failed_retryable', attemptCount: 1, claimed: true })
    expect(state.rpcCalls.map((call) => call.name)).toEqual([
      'claim_solana_platform_activation',
      'fail_solana_platform_activation',
    ])
    expect(state.rpcCalls[1].args._last_error).toBe('injected activation failure')
  })

  it('does not dispatch when another worker owns the live lease', async () => {
    state.claimStatus = 'processing'

    const result = await processSolanaPlatformActivation(adminClient(), requestRow.request_id)

    expect(result).toEqual({ state: 'processing', attemptCount: 1, claimed: false })
    expect(dispatch).not.toHaveBeenCalled()
    expect(state.rpcCalls.map((call) => call.name)).toEqual(['claim_solana_platform_activation'])
  })

  it('parks and alerts after the bounded attempt threshold', async () => {
    state.claimStatus = 'attempts_exhausted'
    state.activationState = 'failed_retryable'
    state.attemptCount = 5

    const result = await processSolanaPlatformActivation(adminClient(), requestRow.request_id)

    expect(result).toEqual({
      state: 'failed_retryable',
      attemptCount: 5,
      claimed: false,
      alertRequired: true,
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('cannot release or complete work after losing the lease token', async () => {
    dispatch.mockRejectedValueOnce(new Error('late stale worker'))
    state.failureState = 'ownership_lost'

    const result = await processSolanaPlatformActivation(adminClient(), requestRow.request_id)

    expect(result).toEqual({ state: 'processing', attemptCount: 1, claimed: true })
  })
})
