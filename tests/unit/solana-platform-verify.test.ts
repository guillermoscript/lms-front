import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const testState = vi.hoisted(() => ({
  request: {} as Record<string, unknown>,
  verifyTransfer: vi.fn(),
  observe: vi.fn(),
  process: vi.fn(),
}))

function chain(result: unknown) {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.in = () => builder
  builder.single = () => Promise.resolve({ data: result, error: null })
  builder.maybeSingle = () => Promise.resolve({ data: result, error: null })
  return builder
}

const sessionClient = {
  auth: { getUser: () => Promise.resolve({ data: { user: { id: 'admin-user' } }, error: null }) },
  from: () => chain({ role: 'admin' }),
}

const adminClient = {
  from: () => chain(testState.request),
}

vi.mock('@/lib/supabase/server', () => ({ createClient: () => sessionClient }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => adminClient }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => 'tenant-622' }))
vi.mock('@/lib/rate-limit', () => ({ paymentPollLimiter: { check: () => Promise.resolve() } }))
vi.mock('@solana/web3.js', () => ({ PublicKey: class PublicKey {} }))
vi.mock('@/lib/billing/solana-platform-payment', () => ({
  getPlatformSolanaConfig: () => ({ rpcUrl: 'https://rpc.example' }),
  resolveStoredSettlement: () => ({ currency: 'usdc', base: 9000000 }),
  verifyPlatformTransfer: testState.verifyTransfer,
}))
vi.mock('@/lib/billing/solana-platform-activation', () => ({
  observeSolanaPlatformPayment: testState.observe,
  processSolanaPlatformActivation: testState.process,
}))

import { POST } from '@/app/api/billing/solana/verify/route'

function request(): NextRequest {
  return {
    json: () => Promise.resolve({ requestId: 'request-622' }),
  } as unknown as NextRequest
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    request_id: 'request-622',
    tenant_id: 'tenant-622',
    plan_id: 'plan-622',
    interval: 'monthly',
    status: 'pending',
    payment_provider: 'solana',
    provider_reference: 'reference-622',
    provider_charge_id: null,
    settlement_currency: 'usdc',
    settlement_base: 9000000,
    settlement_mint: 'mint-622',
    switch_id: null,
    activation_state: null,
    activation_attempt_count: 0,
    platform_plans: { slug: 'starter' },
    ...overrides,
  }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  testState.request = payment()
  testState.verifyTransfer.mockReset().mockResolvedValue({ confirmed: true, signature: 'signature-622' })
  testState.observe.mockReset().mockResolvedValue({
    status: 'observed',
    state: 'observed',
    signature: 'signature-622',
  })
  testState.process.mockReset().mockResolvedValue({
    state: 'activated',
    attemptCount: 1,
    claimed: true,
  })
})

describe('Solana platform verification activation states', () => {
  it('returns activated only after entitlement processing completes', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      confirmed: true,
      state: 'activated',
      signature: 'signature-622',
      attemptCount: 1,
    })
    expect(testState.observe).toHaveBeenCalledOnce()
    expect(testState.process).toHaveBeenCalledOnce()
  })

  it('keeps an observed payment recoverable when activation fails', async () => {
    testState.process.mockResolvedValueOnce({
      state: 'failed_retryable',
      attemptCount: 1,
      claimed: true,
    })

    const body = await (await POST(request())).json()

    expect(body).toMatchObject({
      confirmed: false,
      state: 'failed_retryable',
      signature: 'signature-622',
    })
  })

  it('retries a durable signature without querying the chain again', async () => {
    testState.request = payment({
      status: 'payment_received',
      provider_charge_id: 'signature-622',
      activation_state: 'failed_retryable',
      activation_attempt_count: 1,
    })
    testState.process.mockResolvedValueOnce({
      state: 'processing',
      attemptCount: 2,
      claimed: false,
    })

    const body = await (await POST(request())).json()

    expect(body).toMatchObject({ confirmed: false, state: 'processing', attemptCount: 2 })
    expect(testState.verifyTransfer).not.toHaveBeenCalled()
    expect(testState.observe).not.toHaveBeenCalled()
  })

  it('reports signature reuse as terminal invalidity', async () => {
    testState.observe.mockResolvedValueOnce({
      status: 'signature_conflict',
      state: 'terminal_invalid',
      signature: null,
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ confirmed: false, state: 'terminal_invalid' })
    expect(testState.process).not.toHaveBeenCalled()
  })

  it('returns idempotent success for an already activated request', async () => {
    testState.request = payment({
      status: 'confirmed',
      provider_charge_id: 'signature-622',
      activation_state: 'activated',
    })

    const body = await (await POST(request())).json()

    expect(body).toMatchObject({
      confirmed: true,
      state: 'activated',
      alreadyProcessed: true,
    })
    expect(testState.process).not.toHaveBeenCalled()
  })
})
