import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const testState = vi.hoisted(() => ({
  claimStatus: 'claimed' as 'claimed' | 'processing' | 'completed',
  dispatchError: null as Error | null,
  completeError: null as Error | null,
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  dispatch: vi.fn(),
}))

function adminClient() {
  return {
    rpc: (name: string, args: Record<string, unknown>) => {
      testState.rpcCalls.push({ name, args })
      if (name === 'claim_webhook_event') {
        return Promise.resolve({
          data: [
            {
              event_id: '00000000-0000-0000-0000-000000000625',
              claim_status: testState.claimStatus,
              current_attempt_count: 1,
            },
          ],
          error: null,
        })
      }
      if (name === 'complete_webhook_event' && testState.completeError) {
        return Promise.resolve({ data: null, error: { message: testState.completeError.message } })
      }
      return Promise.resolve({ data: true, error: null })
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => adminClient() }))

vi.mock('@/lib/payments', () => ({
  getPaymentProvider: () => ({
    verifyWebhook: () => Promise.resolve(true),
    normalizeWebhookEvent: (body: string) => {
      const raw = JSON.parse(body) as { id: string }
      return Promise.resolve({
        type: 'payment.succeeded',
        providerEventId: raw.id,
        reference: '42',
        raw,
      })
    },
  }),
}))

vi.mock('@/lib/payments/webhook-dispatch', () => ({
  dispatchBillingEvent: (...args: unknown[]) => {
    testState.dispatch(...args)
    return testState.dispatchError
      ? Promise.reject(testState.dispatchError)
      : Promise.resolve()
  },
}))

import { POST } from '@/app/api/payments/webhook/[provider]/route'

function request(id = 'evt_student_1'): NextRequest {
  return {
    text: () => Promise.resolve(JSON.stringify({ id })),
    headers: new Headers(),
  } as unknown as NextRequest
}

const params = (provider = 'paypal') => ({ params: Promise.resolve({ provider }) })

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests'
  testState.claimStatus = 'claimed'
  testState.dispatchError = null
  testState.completeError = null
  testState.rpcCalls = []
  testState.dispatch.mockClear()
})

describe('student billing webhook claim contract', () => {
  it('dispatches and completes only after claiming the student namespace', async () => {
    const res = await POST(request(), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, eventStatus: 'accepted' })
    expect(testState.dispatch).toHaveBeenCalledOnce()
    expect(testState.rpcCalls.map((call) => call.name)).toEqual([
      'claim_webhook_event',
      'complete_webhook_event',
    ])
    expect(testState.rpcCalls[0].args).toMatchObject({
      _provider: 'paypal',
      _provider_event_id: 'evt_student_1',
      _event_type: 'payment.succeeded',
    })
  })

  it('acknowledges an active lease without dispatching', async () => {
    testState.claimStatus = 'processing'
    const res = await POST(request(), params())

    expect(res.status).toBe(409)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(await res.json()).toMatchObject({
      processing: true,
      eventStatus: 'already_processing',
    })
    expect(testState.dispatch).not.toHaveBeenCalled()
    expect(testState.rpcCalls.map((call) => call.name)).toEqual(['claim_webhook_event'])
  })

  it('acknowledges a completed event without dispatching', async () => {
    testState.claimStatus = 'completed'
    const res = await POST(request(), params())

    expect(await res.json()).toMatchObject({
      duplicate: true,
      eventStatus: 'already_completed',
    })
    expect(testState.dispatch).not.toHaveBeenCalled()
  })

  it('records and releases a transient dispatch failure for immediate retry', async () => {
    testState.dispatchError = new Error('temporary database outage')
    const res = await POST(request(), params())

    expect(res.status).toBe(500)
    expect(testState.rpcCalls.map((call) => call.name)).toEqual([
      'claim_webhook_event',
      'fail_webhook_event',
    ])
    expect(testState.rpcCalls[1].args._last_error).toBe('temporary database outage')
  })

  it('releases the claim when durable completion fails', async () => {
    testState.completeError = new Error('completion database outage')
    const res = await POST(request(), params())

    expect(res.status).toBe(500)
    expect(testState.rpcCalls.map((call) => call.name)).toEqual([
      'claim_webhook_event',
      'complete_webhook_event',
      'fail_webhook_event',
    ])
  })

  it('preserves the Binance Pay transport acknowledgment for active claims', async () => {
    testState.claimStatus = 'processing'
    const res = await POST(request(), params('binance'))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      returnCode: 'FAIL',
      returnMessage: 'Event is already processing',
      eventStatus: 'already_processing',
    })
  })
})
