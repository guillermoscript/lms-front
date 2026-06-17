import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins the CAPABILITY-BRANCH contract of the admin create actions (issue #280
 * provider-agnostic admin UI). The actions build their own Supabase + provider
 * deps from module imports, so we mock those modules — but keep the REAL
 * PROVIDER_CAPABILITIES map so the branch is driven by the same table the app
 * ships, not a stub. The branch under test:
 *   - createsCatalog (stripe/paypal)      → auto-create product + price.
 *   - isMerchantOfRecord (lemonsqueezy)   → require a pasted variant id; no API.
 *   - else (solana/solana_subs)           → no catalog; require a wallet row.
 */

interface FakeAdmin {
  from(table: string): unknown
  _inserted: { table: string; values: Record<string, unknown> }[]
}

const state: {
  admin: FakeAdmin
  walletRow: { wallet_address: string } | null
  providerCalls: { createProduct: number; createPrice: number }
} = {
  admin: makeFakeAdmin(),
  walletRow: null,
  providerCalls: { createProduct: 0, createPrice: 0 },
}

function makeFakeAdmin(): FakeAdmin {
  const inserted: { table: string; values: Record<string, unknown> }[] = []
  function builder(table: string) {
    let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null
    const b: Record<string, unknown> = {
      insert(values: Record<string, unknown> | Record<string, unknown>[]) {
        pendingInsert = values
        inserted.push({ table, values: Array.isArray(values) ? values[0] : values })
        return b
      },
      select() { return b },
      eq() { return b },
      delete() { return b },
      maybeSingle() {
        return Promise.resolve({
          data: table === 'tenant_payment_wallets' ? state.walletRow : null,
          error: null,
        })
      },
      single() {
        const row = (Array.isArray(pendingInsert) ? pendingInsert[0] : pendingInsert) || {}
        const idKey = table === 'plans' ? 'plan_id' : 'product_id'
        return Promise.resolve({ data: { ...row, [idKey]: 1 }, error: null })
      },
      // Awaitable terminal for chains without .single() (plan_courses/product_courses).
      then(resolve: (v: { data: null; error: null }) => unknown) {
        return Promise.resolve({ data: null, error: null }).then(resolve)
      },
    }
    return b
  }
  return {
    from(table: string) { return builder(table) },
    _inserted: inserted,
  }
}

function makeFakeProvider(slug: string) {
  return {
    provider: slug,
    convertAmount: (amount: number) => amount,
    createProduct: async () => { state.providerCalls.createProduct++; return { id: 'prod_x' } },
    createPrice: async () => { state.providerCalls.createPrice++; return { id: 'price_x' } },
    updateProduct: async () => ({ id: 'prod_x' }),
    archivePrice: async () => {},
    archiveProduct: async () => {},
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve('t1') }))
vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: () => Promise.resolve(false) }))
vi.mock('@/lib/supabase/admin', () => ({
  verifyAdminAccess: () => Promise.resolve(),
  createAdminClient: () => state.admin,
}))
vi.mock('@/lib/payments', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments')>()
  return { ...actual, getPaymentProvider: (slug: string) => makeFakeProvider(slug) }
})

import { createPlan } from '@/app/actions/admin/plans'
import { createProduct } from '@/app/actions/admin/products'

const basePlan = {
  plan_name: 'Pro', description: 'd', price: 10, duration_in_days: 30 as const,
  currency: 'usd' as const, courseIds: [],
}
const baseProduct = {
  name: 'Course', description: 'd', price: 10, currency: 'usd' as const, courseIds: [1],
}

beforeEach(() => {
  state.admin = makeFakeAdmin()
  state.walletRow = null
  state.providerCalls = { createProduct: 0, createPrice: 0 }
})

describe('createPlan — capability branch', () => {
  it('stripe → auto-creates product + price and stores both ids', async () => {
    const r = await createPlan({ ...basePlan, paymentProvider: 'stripe' })
    expect(r.success).toBe(true)
    expect(state.providerCalls).toEqual({ createProduct: 1, createPrice: 1 })
    const row = state.admin._inserted.find(i => i.table === 'plans')!.values
    expect(row.payment_provider).toBe('stripe')
    expect(row.provider_product_id).toBe('prod_x')
    expect(row.provider_price_id).toBe('price_x')
  })

  it('lemonsqueezy WITHOUT variant id → fails, no provider call, no insert', async () => {
    const r = await createPlan({ ...basePlan, paymentProvider: 'lemonsqueezy' })
    expect(r.success).toBe(false)
    expect(r.success ? '' : r.error).toMatch(/variant id/i)
    expect(state.providerCalls.createProduct).toBe(0)
    expect(state.admin._inserted.find(i => i.table === 'plans')).toBeUndefined()
  })

  it('lemonsqueezy WITH variant id → stores it as provider_price_id, product id null, no provider call', async () => {
    const r = await createPlan({ ...basePlan, paymentProvider: 'lemonsqueezy', providerPriceId: 'var_123' })
    expect(r.success).toBe(true)
    expect(state.providerCalls.createProduct).toBe(0)
    const row = state.admin._inserted.find(i => i.table === 'plans')!.values
    expect(row.provider_price_id).toBe('var_123')
    expect(row.provider_product_id).toBeNull()
  })

  it('solana WITHOUT a configured wallet → fails with a wallet message, no insert', async () => {
    state.walletRow = null
    const r = await createPlan({ ...basePlan, paymentProvider: 'solana' })
    expect(r.success).toBe(false)
    expect(r.success ? '' : r.error).toMatch(/wallet/i)
    expect(state.admin._inserted.find(i => i.table === 'plans')).toBeUndefined()
  })

  it('solana_subs WITH a wallet → inserts with null catalog ids, no provider call', async () => {
    state.walletRow = { wallet_address: 'So1aNaWa11et1111111111111111111111111111111' }
    const r = await createPlan({ ...basePlan, paymentProvider: 'solana_subs' })
    expect(r.success).toBe(true)
    expect(state.providerCalls.createProduct).toBe(0)
    const row = state.admin._inserted.find(i => i.table === 'plans')!.values
    expect(row.payment_provider).toBe('solana_subs')
    expect(row.provider_product_id).toBeNull()
    expect(row.provider_price_id).toBeNull()
  })
})

describe('createProduct — capability branch', () => {
  it('stripe → auto-creates product + price', async () => {
    const r = await createProduct({ ...baseProduct, paymentProvider: 'stripe' })
    expect(r.success).toBe(true)
    expect(state.providerCalls).toEqual({ createProduct: 1, createPrice: 1 })
    const row = state.admin._inserted.find(i => i.table === 'products')!.values
    expect(row.provider_product_id).toBe('prod_x')
    expect(row.provider_price_id).toBe('price_x')
  })

  it('lemonsqueezy WITHOUT variant id → fails, no insert', async () => {
    const r = await createProduct({ ...baseProduct, paymentProvider: 'lemonsqueezy' })
    expect(r.success).toBe(false)
    expect(r.success ? '' : r.error).toMatch(/variant id/i)
    expect(state.admin._inserted.find(i => i.table === 'products')).toBeUndefined()
  })

  it('lemonsqueezy WITH variant id → stores it, no provider call', async () => {
    const r = await createProduct({ ...baseProduct, paymentProvider: 'lemonsqueezy', providerPriceId: 'var_999' })
    expect(r.success).toBe(true)
    expect(state.providerCalls.createProduct).toBe(0)
    const row = state.admin._inserted.find(i => i.table === 'products')!.values
    expect(row.provider_price_id).toBe('var_999')
    expect(row.provider_product_id).toBeNull()
  })

  it('solana WITHOUT a wallet → fails', async () => {
    state.walletRow = null
    const r = await createProduct({ ...baseProduct, paymentProvider: 'solana' })
    expect(r.success).toBe(false)
    expect(r.success ? '' : r.error).toMatch(/wallet/i)
  })

  it('solana WITH a wallet → inserts with null catalog ids', async () => {
    state.walletRow = { wallet_address: 'So1aNaWa11et1111111111111111111111111111111' }
    const r = await createProduct({ ...baseProduct, paymentProvider: 'solana' })
    expect(r.success).toBe(true)
    expect(state.providerCalls.createProduct).toBe(0)
    const row = state.admin._inserted.find(i => i.table === 'products')!.values
    expect(row.provider_product_id).toBeNull()
    expect(row.provider_price_id).toBeNull()
  })
})
