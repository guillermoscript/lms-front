import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * The stalled-webhook redelivery cron (issue #625 follow-up). The atomic claim
 * contract's one orphan case is a worker that dies without releasing its lease:
 * provider retries inside the lease window all get 409, and a provider with a
 * bounded retry schedule can give up before the lease expires — a paid event
 * nobody ever processes. This cron replays such rows through the SAME
 * normalize → claim → dispatch → complete pipeline the live routes run.
 *
 * What is faked: Supabase (recording), the provider factories, both
 * dispatchers. What is real: the route's own selection/claim/complete flow and
 * the claim helper module (its RPC calls hit the recording fake).
 */

const state: {
  rows: Record<string, unknown>[]
  claimStatus: 'claimed' | 'processing' | 'completed'
  normalized: Record<string, unknown> | null
  rpcCalls: { name: string; args: Record<string, unknown> }[]
  adapterThrows: boolean
} = {
  rows: [],
  claimStatus: 'claimed',
  normalized: null,
  rpcCalls: [],
  adapterThrows: false,
}

function makeAdmin() {
  function builder() {
    const b: Record<string, unknown> = {
      select: () => b,
      is: () => b,
      or: () => b,
      lt: () => b,
      lte: () => b,
      order: () => b,
      limit: () => b,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: state.rows, error: null }).then(resolve),
    }
    return b
  }
  return {
    from: () => builder(),
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args })
      if (name === 'claim_webhook_event') {
        return Promise.resolve({
          data: [
            {
              event_id: 'evt-row-1',
              claim_status: state.claimStatus,
              current_attempt_count: 2,
            },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: true, error: null })
    },
  }
}

const normalizeWebhookEvent = vi.fn(async () => {
  if (state.adapterThrows) throw new Error('unparseable payload')
  return state.normalized
})
const fakeAdapter = { normalizeWebhookEvent }

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeAdmin() }))
vi.mock('@/lib/payments', () => ({ getPaymentProvider: () => fakeAdapter }))
vi.mock('@/lib/billing/platform-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-billing')>()
  return { ...actual, getPlatformBillingProvider: () => fakeAdapter }
})
vi.mock('@/lib/payments/webhook-dispatch', () => ({ dispatchBillingEvent: vi.fn() }))
vi.mock('@/lib/billing/platform-webhook-dispatch', () => ({
  dispatchPlatformBillingEvent: vi.fn(),
}))

import { GET } from '@/app/api/cron/redeliver-webhook-events/route'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'

const SECRET = 'cron-secret'

function makeReq(auth: string | null = `Bearer ${SECRET}`): NextRequest {
  return {
    headers: { get: (k: string) => (k === 'authorization' ? auth : null) },
  } as unknown as NextRequest
}

function stalledRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-row-1',
    provider: 'binance',
    provider_event_id: 'bn-evt-1',
    event_type: 'payment.succeeded',
    payload: { bizType: 'PAY', data: '{}' },
    attempt_count: 2,
    ...overrides,
  }
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  state.rows = []
  state.claimStatus = 'claimed'
  state.normalized = { type: 'payment.succeeded', providerEventId: 'bn-evt-1', raw: {} }
  state.rpcCalls = []
  state.adapterThrows = false
  vi.mocked(dispatchBillingEvent).mockReset()
  vi.mocked(dispatchPlatformBillingEvent).mockReset()
  normalizeWebhookEvent.mockClear()
})

describe('cron: redeliver stalled webhook events', () => {
  it('rejects a missing or wrong cron secret', async () => {
    expect((await GET(makeReq(null))).status).toBe(401)
    expect((await GET(makeReq('Bearer nope'))).status).toBe(401)
  })

  it('replays a stalled STUDENT event through claim → dispatch → complete', async () => {
    state.rows = [stalledRow()]

    const res = await GET(makeReq())
    const body = await res.json()

    expect(body).toMatchObject({ scanned: 1, redelivered: 1, failed: 0 })
    expect(vi.mocked(dispatchBillingEvent)).toHaveBeenCalledWith(
      state.normalized,
      expect.objectContaining({ provider: 'binance' }),
    )
    // Claimed under the row's own ledger key, then completed under the token.
    const names = state.rpcCalls.map((c) => c.name)
    expect(names).toEqual(['claim_webhook_event', 'complete_webhook_event'])
    expect(state.rpcCalls[0].args._provider).toBe('binance')
    expect(state.rpcCalls[0].args._provider_event_id).toBe('bn-evt-1')
  })

  it('routes a platform-namespaced row to the PLATFORM dispatcher with the bare slug', async () => {
    state.rows = [stalledRow({ provider: 'platform:binance', provider_event_id: 'bn-plat-1' })]

    const res = await GET(makeReq())
    const body = await res.json()

    expect(body).toMatchObject({ redelivered: 1 })
    expect(vi.mocked(dispatchPlatformBillingEvent)).toHaveBeenCalledWith(
      state.normalized,
      expect.objectContaining({ provider: 'binance' }),
    )
    expect(vi.mocked(dispatchBillingEvent)).not.toHaveBeenCalled()
    // The claim keeps the NAMESPACED key — same ledger row the route wrote.
    expect(state.rpcCalls[0].args._provider).toBe('platform:binance')
  })

  it('walks away when a live delivery owns the claim', async () => {
    state.rows = [stalledRow()]
    state.claimStatus = 'processing'

    const body = await (await GET(makeReq())).json()

    expect(body).toMatchObject({ redelivered: 0, skipped: 1 })
    expect(vi.mocked(dispatchBillingEvent)).not.toHaveBeenCalled()
    expect(state.rpcCalls.map((c) => c.name)).toEqual(['claim_webhook_event'])
  })

  it('releases the claim and counts a failure when dispatch throws', async () => {
    state.rows = [stalledRow()]
    vi.mocked(dispatchBillingEvent).mockRejectedValueOnce(new Error('db down'))

    const body = await (await GET(makeReq())).json()

    expect(body).toMatchObject({ redelivered: 0, failed: 1 })
    expect(state.rpcCalls.map((c) => c.name)).toEqual([
      'claim_webhook_event',
      'fail_webhook_event',
    ])
  })

  it('retires an event the adapter no longer models instead of re-scanning it forever', async () => {
    state.rows = [stalledRow()]
    state.normalized = null

    const body = await (await GET(makeReq())).json()

    expect(body).toMatchObject({ retired: 1, redelivered: 0 })
    expect(vi.mocked(dispatchBillingEvent)).not.toHaveBeenCalled()
    expect(state.rpcCalls.map((c) => c.name)).toEqual([
      'claim_webhook_event',
      'complete_webhook_event',
    ])
  })

  it('leaves rows from unknown namespaces alone', async () => {
    state.rows = [stalledRow({ provider: 'platform:solana' }), stalledRow({ provider: 'manual' })]

    const body = await (await GET(makeReq())).json()

    expect(body).toMatchObject({ scanned: 2, skipped: 2, redelivered: 0 })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('counts a normalizer crash as failed without touching the claim', async () => {
    state.rows = [stalledRow()]
    state.adapterThrows = true

    const body = await (await GET(makeReq())).json()

    expect(body).toMatchObject({ failed: 1, redelivered: 0 })
    expect(state.rpcCalls).toHaveLength(0)
  })
})
