import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const testState = vi.hoisted(() => ({
  queue: [] as { request_id: string }[],
  parked: [] as Record<string, unknown>[],
  updateSucceeds: true,
  process: vi.fn(),
}))

function adminClient() {
  let readNumber = 0

  return {
    from: () => {
      const readIndex = readNumber++
      let isUpdate = false
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'or', 'lt', 'gte', 'order', 'limit', 'is']) {
        builder[method] = () => builder
      }
      builder.update = () => {
        isUpdate = true
        return builder
      }
      builder.maybeSingle = () =>
        Promise.resolve({
          data: testState.updateSucceeds ? { request_id: 'parked-1' } : null,
          error: null,
        })
      builder.then = (resolve: (value: unknown) => unknown) => {
        const data = isUpdate ? null : readIndex === 0 ? testState.queue : testState.parked
        return Promise.resolve({ data, error: null }).then(resolve)
      }
      return builder
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => adminClient() }))
vi.mock('@/lib/billing/solana-platform-activation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/solana-platform-activation')>()
  return {
    ...actual,
    processSolanaPlatformActivation: testState.process,
  }
})

import { GET } from '@/app/api/cron/reconcile-solana-platform-activations/route'

const SECRET = 'cron-secret'

function request(auth: string | null = `Bearer ${SECRET}`): NextRequest {
  return {
    headers: { get: () => auth },
  } as unknown as NextRequest
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  testState.queue = []
  testState.parked = []
  testState.updateSucceeds = true
  testState.process.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('cron: reconcile Solana platform activations', () => {
  it('rejects a missing or incorrect cron secret', async () => {
    expect((await GET(request(null))).status).toBe(401)
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
  })

  it('retries each due request and emits one durable alert for parked work', async () => {
    testState.queue = [{ request_id: 'request-a' }, { request_id: 'request-b' }]
    testState.parked = [
      {
        request_id: 'parked-1',
        tenant_id: 'tenant-1',
        provider_charge_id: 'signature-1',
        activation_attempt_count: 5,
        activation_last_error: 'database unavailable',
      },
    ]
    testState.process
      .mockResolvedValueOnce({ state: 'activated', attemptCount: 2, claimed: true })
      .mockResolvedValueOnce({ state: 'failed_retryable', attemptCount: 3, claimed: true })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      scanned: 2,
      activated: 1,
      failed: 1,
      processing: 0,
      alerts: 1,
      errors: 0,
    })
    expect(testState.process).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledWith(
      '[billing-alert]',
      expect.stringContaining('solana_platform_activation_exhausted'),
    )
  })

  it('continues the batch when one activation throws', async () => {
    testState.queue = [{ request_id: 'broken' }, { request_id: 'healthy' }]
    testState.process
      .mockRejectedValueOnce(new Error('claim RPC unavailable'))
      .mockResolvedValueOnce({ state: 'processing', attemptCount: 1, claimed: false })

    const body = await (await GET(request())).json()

    expect(body).toMatchObject({ scanned: 2, processing: 1, errors: 1 })
    expect(testState.process).toHaveBeenCalledTimes(2)
  })
})
