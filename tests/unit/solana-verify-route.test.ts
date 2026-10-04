/**
 * Guards on `POST /api/payments/solana/verify`.
 *
 * Solana Pay has no signed webhook: this endpoint IS the settlement path, and a
 * browser calls it in a polling loop. Until now nothing tested the route at all
 * — the chain helpers underneath had unit tests, the route that decides whether
 * a poll becomes course access had none.
 *
 * These cover the checks that make a fabricated confirmation impossible and a
 * repeated poll harmless. The chain itself is mocked: what a real transfer looks
 * like is `solana-reconcile`'s job and is tested there. What is proven here is
 * that no caller reaches the chain at all without passing ownership, tenant,
 * provider and status gates first.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_test_key'

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  authError: null as unknown,
  tenantId: 'tenant-1',
  tx: null as Record<string, unknown> | null,
  rateLimited: false,
  /** Every transactions query the route built, so scoping can be asserted. */
  filters: [] as Record<string, unknown>[],
  reconcileCalls: 0,
  reconcileResult: 'not_found' as 'not_found' | 'confirmed' | 'validation_error',
}))

function txQuery() {
  const applied: Record<string, unknown> = {}
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      applied[column] = value
      return builder
    },
    maybeSingle: () => {
      state.filters.push(applied)
      return Promise.resolve({ data: state.tx, error: null })
    },
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: state.user }, error: state.authError }) },
      from: () => txQuery(),
    }),
}))

vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(state.tenantId),
}))

vi.mock('@/lib/rate-limit', () => ({
  paymentPollLimiter: {
    check: () => (state.rateLimited ? Promise.reject(new Error('rate limited')) : Promise.resolve()),
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: function eq() {
          return this
        },
        then: (resolve: (v: unknown) => void) => resolve({ count: 0 }),
      }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))

// The chain. Reaching any of these means the guards let the caller through.
vi.mock('@solana/pay', () => ({
  findReference: () => Promise.resolve({ signature: 'sig-1' }),
  FindReferenceError: class FindReferenceError extends Error {},
}))
vi.mock('@solana/web3.js', () => ({
  Connection: class {},
  PublicKey: class {
    constructor(public value: string) {}
  },
  Keypair: class {},
}))
vi.mock('@solana/kit', () => ({ getBase58Encoder: () => ({ encode: (v: string) => v }) }))
vi.mock('@/lib/payments/solana-reconcile', () => ({
  reconcileSolanaOneTimeTransaction: () => {
    state.reconcileCalls++
    // `ReconcileResult` vocabulary — 'not_found' is what a poll before the
    // transfer lands actually gets, which is the common case for this endpoint.
    return Promise.resolve({ status: state.reconcileResult })
  },
}))
vi.mock('@/lib/payments/solana-subscriptions', () => ({
  deriveSubscriptionPda: () => ({}),
  getSubscriptionState: () => Promise.resolve(null),
}))
vi.mock('@/lib/payments/solana-subscription-pull', () => ({
  pullSplitForSubscription: () => Promise.resolve({ ok: true }),
}))
vi.mock('@/lib/analytics/server', () => ({
  track: () => Promise.resolve(),
  safeAnalytics: (fn: () => Promise<void>) => fn().catch(() => undefined),
}))

const { POST } = await import('@/app/api/payments/solana/verify/route')

function post(body: unknown) {
  return POST({ json: () => Promise.resolve(body) } as unknown as NextRequest)
}

const PENDING_TX = {
  transaction_id: 4242,
  status: 'pending',
  amount: 25,
  currency: 'usd',
  refunded_amount: 0,
  school_percentage_snapshot: 80,
  payment_provider: 'solana',
  provider_subscription_id: 'reference-pubkey',
  user_id: 'user-1',
  tenant_id: 'tenant-1',
  plan_id: null,
  product_id: 7,
  provider_metadata: {},
  settlement_currency: 'usdc',
  settlement_base: '25000000',
  settlement_mint: 'mint',
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.authError = null
  state.tenantId = 'tenant-1'
  state.tx = { ...PENDING_TX }
  state.rateLimited = false
  state.filters = []
  state.reconcileCalls = 0
  state.reconcileResult = 'not_found'
})

describe('solana verify route guards', () => {
  it('refuses a request with no transaction id', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    expect(state.reconcileCalls).toBe(0)
  })

  it('refuses an anonymous caller', async () => {
    state.user = null
    const res = await post({ transactionId: 4242 })
    expect(res.status).toBe(401)
    expect(state.reconcileCalls).toBe(0)
  })

  it('rate-limits a polling client', async () => {
    state.rateLimited = true
    const res = await post({ transactionId: 4242 })
    expect(res.status).toBe(429)
    expect(state.reconcileCalls).toBe(0)
  })

  it('scopes the lookup to the caller AND their tenant', async () => {
    await post({ transactionId: 4242 })

    // Either filter missing turns this into "confirm anyone's transaction".
    expect(state.filters).toHaveLength(1)
    expect(state.filters[0]).toMatchObject({
      transaction_id: 4242,
      user_id: 'user-1',
      tenant_id: 'tenant-1',
    })
  })

  it('404s a transaction the caller does not own', async () => {
    state.tx = null
    const res = await post({ transactionId: 4242 })
    expect(res.status).toBe(404)
    expect(state.reconcileCalls).toBe(0)
  })

  it('refuses a transaction that belongs to another rail', async () => {
    state.tx = { ...PENDING_TX, payment_provider: 'stripe' }
    const res = await post({ transactionId: 4242 })
    expect(res.status).toBe(400)
    // A Stripe sale must never be settleable by claiming it was on-chain.
    expect(state.reconcileCalls).toBe(0)
  })

  it('answers a repeated poll on a settled sale without touching the chain', async () => {
    state.tx = { ...PENDING_TX, status: 'successful' }
    const res = await post({ transactionId: 4242 })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ confirmed: true, alreadyProcessed: true })
    // Idempotence is what stops one settlement event per poll.
    expect(state.reconcileCalls).toBe(0)
  })

  it('reports a cancelled sale as unconfirmed instead of reviving it', async () => {
    state.tx = { ...PENDING_TX, status: 'canceled' }
    const res = await post({ transactionId: 4242 })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ confirmed: false, status: 'canceled' })
    expect(state.reconcileCalls).toBe(0)
  })

  it('refuses a pending row with no on-chain reference', async () => {
    state.tx = { ...PENDING_TX, provider_subscription_id: null }
    const res = await post({ transactionId: 4242 })

    expect(res.status).toBe(400)
    expect(state.reconcileCalls).toBe(0)
  })

  it('reaches the chain only once every guard has passed', async () => {
    const res = await post({ transactionId: 4242 })

    // Nothing on chain yet — the normal answer while the buyer is still paying.
    expect(state.reconcileCalls).toBe(1)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ confirmed: false })
  })

  it('refuses to settle when the transfer does not match what was quoted', async () => {
    state.reconcileResult = 'validation_error'

    const res = await post({ transactionId: 4242 })

    // An underpaid or misdirected transfer must not buy the course.
    expect(state.reconcileCalls).toBe(1)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.confirmed).not.toBe(true)
  })
})
