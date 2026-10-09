import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * #950 — `/api/billing/solana/verify` confirms a platform-FEE QR through the
 * same observe → activation workflow as a plan, reads the fee columns, and
 * tells the page which kind it confirmed.
 */

const state = vi.hoisted(() => ({
  request: {} as Record<string, unknown>,
  selects: [] as string[],
  verifyTransfer: vi.fn(),
  observe: vi.fn(),
  process: vi.fn(),
}))

function chain(result: unknown, track = false) {
  const b: Record<string, unknown> = {}
  b.select = (cols: string) => {
    if (track) state.selects.push(cols)
    return b
  }
  b.eq = () => b
  b.in = () => b
  b.single = () => Promise.resolve({ data: result, error: null })
  b.maybeSingle = () => Promise.resolve({ data: result, error: null })
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'admin-user' } }, error: null }) },
    from: () => chain({ role: 'admin' }),
  }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => chain(state.request, true) }) }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => 'tenant-950' }))
vi.mock('@/lib/rate-limit', () => ({ paymentPollLimiter: { check: () => Promise.resolve() } }))
vi.mock('@solana/web3.js', () => ({ PublicKey: class PublicKey {} }))
vi.mock('@/lib/billing/solana-platform-payment', () => ({
  getPlatformSolanaConfig: () => ({ rpcUrl: 'https://rpc.example' }),
  resolveStoredSettlement: () => ({ totalBase: 12_500_000, decimals: 6 }),
  verifyPlatformTransfer: state.verifyTransfer,
}))
vi.mock('@/lib/billing/solana-platform-activation', () => ({
  observeSolanaPlatformPayment: state.observe,
  processSolanaPlatformActivation: state.process,
}))

import { POST } from '@/app/api/billing/solana/verify/route'

const req = () => ({ json: () => Promise.resolve({ requestId: 'req-fee' }) }) as unknown as NextRequest

const feeRequest = (overrides: Record<string, unknown> = {}) => ({
  request_id: 'req-fee',
  tenant_id: 'tenant-950',
  plan_id: null,
  fee_payment_id: 'pay-950',
  request_type: 'fee',
  interval: null,
  status: 'pending',
  payment_provider: 'solana',
  provider_reference: 'ref-950',
  provider_charge_id: null,
  settlement_currency: 'usdc',
  settlement_base: 12_500_000,
  settlement_mint: 'mint',
  switch_id: null,
  activation_state: null,
  activation_attempt_count: 0,
  platform_plans: null,
  ...overrides,
})

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  state.request = feeRequest()
  state.selects = []
  state.verifyTransfer.mockReset().mockResolvedValue({ confirmed: true, signature: 'sig-950' })
  state.observe.mockReset().mockResolvedValue({ status: 'observed', state: 'observed', signature: 'sig-950' })
  state.process.mockReset().mockResolvedValue({ state: 'activated', attemptCount: 1, claimed: true })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('POST /api/billing/solana/verify — fee requests', () => {
  it('selects the fee columns alongside the plan ones', async () => {
    await POST(req())
    expect(state.selects[0]).toContain('fee_payment_id')
    expect(state.selects[0]).toContain('request_type')
    expect(state.selects[0]).toContain('plan_id')
  })

  it('observes the signature, runs the (fee-aware) activation, and answers kind: fee', async () => {
    const res = await POST(req())
    const body = await res.json()

    expect(body).toMatchObject({ confirmed: true, state: 'activated', signature: 'sig-950', kind: 'fee' })
    expect(state.observe).toHaveBeenCalledWith(expect.anything(), 'req-fee', 'tenant-950', 'sig-950')
    expect(state.process).toHaveBeenCalledWith(expect.anything(), 'req-fee')
  })

  it('an already-settled fee request answers confirmed without touching the chain', async () => {
    state.request = feeRequest({ status: 'confirmed', activation_state: 'activated', provider_charge_id: 'sig-950' })

    const body = await (await POST(req())).json()

    expect(body).toMatchObject({ confirmed: true, alreadyProcessed: true, kind: 'fee' })
    expect(state.verifyTransfer).not.toHaveBeenCalled()
    expect(state.process).not.toHaveBeenCalled()
  })

  it('a plan request is labelled kind: plan', async () => {
    state.request = feeRequest({ plan_id: 'plan-1', fee_payment_id: null, request_type: 'upgrade', interval: 'monthly' })

    const body = await (await POST(req())).json()

    expect(body).toMatchObject({ confirmed: true, kind: 'plan' })
  })
})
