import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('tests must inject the admin client')
  },
}))

import {
  computeProductCharge,
  FeeSplitUnavailableError,
  getTenantRevenueSplit,
  pendingCheckoutMatches,
  resolveProductCharge,
  type ChargeableProduct,
} from '@/lib/payments/product-charge'
import { chargedAmount } from '@/lib/payments/fee-bearer'

/**
 * #927 review: the checkout page (what the buyer sees) and both checkout
 * routes (what the buyer is charged) resolve the charge through ONE helper,
 * with the split read for the product's tenant on the service-role client.
 */

const TENANT = 'tenant-a'

type Row = { tenant_id: string; platform_percentage: number; school_percentage: number } | null

/** Minimal fake of `admin.from('revenue_splits').select().eq().maybeSingle()`. */
function fakeAdmin(rows: Record<string, Row>, error: { message: string } | null = null) {
  const calls: { table: string; tenantId?: string }[] = []
  const client = {
    from(table: string) {
      const call: { table: string; tenantId?: string } = { table }
      calls.push(call)
      const q = {
        select: () => q,
        eq: (col: string, value: string) => {
          if (col === 'tenant_id') call.tenantId = value
          return q
        },
        maybeSingle: async () => ({ data: error ? null : (rows[call.tenantId ?? ''] ?? null), error }),
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const product = (over: Partial<ChargeableProduct> = {}): ChargeableProduct => ({
  tenant_id: TENANT,
  price: 100,
  currency: 'usd',
  payment_provider: 'paypal',
  fee_bearer: 'student',
  ...over,
})

describe('getTenantRevenueSplit', () => {
  it('reads the split for exactly the tenant asked for', async () => {
    const { client, calls } = fakeAdmin({ [TENANT]: { tenant_id: TENANT, platform_percentage: 20, school_percentage: 80 } })
    await expect(getTenantRevenueSplit(TENANT, client)).resolves.toEqual({ platformPercentage: 20, schoolPercentage: 80 })
    expect(calls).toEqual([{ table: 'revenue_splits', tenantId: TENANT }])
  })

  it('keeps a 0% platform fee as 0, not "unset" (#605)', async () => {
    const { client } = fakeAdmin({ [TENANT]: { tenant_id: TENANT, platform_percentage: 0, school_percentage: 100 } })
    await expect(getTenantRevenueSplit(TENANT, client)).resolves.toEqual({ platformPercentage: 0, schoolPercentage: 100 })
  })

  it('returns null only when there is genuinely no row', async () => {
    const { client } = fakeAdmin({})
    await expect(getTenantRevenueSplit(TENANT, client)).resolves.toBeNull()
  })

  it('throws on a query error instead of reading it as "no split"', async () => {
    const { client } = fakeAdmin({}, { message: 'boom' })
    await expect(getTenantRevenueSplit(TENANT, client)).rejects.toThrow(/boom/)
  })
})

describe('computeProductCharge', () => {
  const split = { platformPercentage: 20, schoolPercentage: 80 }

  it('grosses up a student-borne fee so the school receives the listed price', () => {
    const charge = computeProductCharge(product(), split)
    expect(charge).toMatchObject({ price: 100, amount: 125, feeBearer: 'student', schoolPercentage: 80, feeIncluded: true })
  })

  it('charges the listed price when the school bears the fee', () => {
    const charge = computeProductCharge(product({ fee_bearer: 'school' }), split)
    expect(charge).toMatchObject({ amount: 100, feeBearer: 'school', feeIncluded: false })
  })

  it('fails loudly when the student bears the fee and no split resolves', () => {
    expect(() => computeProductCharge(product(), null)).toThrow(FeeSplitUnavailableError)
  })

  it('falls back to the documented default split only when the school bears the fee', () => {
    const charge = computeProductCharge(product({ fee_bearer: 'school' }), null)
    expect(charge).toMatchObject({ amount: 100, platformPercentage: 20, schoolPercentage: 80 })
  })

  it('a student bearer on a provider that cannot honour it is a school bearer — no split needed', () => {
    // Lemon Squeezy prices from its own variant; manual bears no platform fee.
    for (const payment_provider of ['lemonsqueezy', 'manual']) {
      const charge = computeProductCharge(product({ payment_provider }), null)
      expect(charge).toMatchObject({ amount: 100, feeBearer: 'school' })
    }
  })

  it('a 0% split charges the listed price even when the student bears the fee', () => {
    const charge = computeProductCharge(product(), { platformPercentage: 0, schoolPercentage: 100 })
    expect(charge).toMatchObject({ amount: 100, feeBearer: 'student', feeIncluded: false })
  })

  it('agrees with chargedAmount for every plan fee tier', () => {
    for (const platformPercentage of [20, 10, 5, 2]) {
      const charge = computeProductCharge(product({ price: 49.99 }), {
        platformPercentage,
        schoolPercentage: 100 - platformPercentage,
      })
      expect(charge.amount).toBe(chargedAmount(49.99, platformPercentage, 'student', 'usd'))
    }
  })
})

describe('resolveProductCharge', () => {
  it('display and charge cannot diverge: same product + split → same amount, whoever asks', async () => {
    const { client } = fakeAdmin({ [TENANT]: { tenant_id: TENANT, platform_percentage: 10, school_percentage: 90 } })
    const page = await resolveProductCharge(product(), { expectedTenantId: TENANT, admin: client })
    const route = await resolveProductCharge(product(), { expectedTenantId: TENANT, admin: client })
    expect(page.amount).toBe(route.amount)
    expect(page.amount).toBe(111.12) // 100 / 0.9, rounded UP
  })

  it("reads the split of the PRODUCT's tenant, not anything buyer-scoped", async () => {
    const { client, calls } = fakeAdmin({ [TENANT]: { tenant_id: TENANT, platform_percentage: 20, school_percentage: 80 } })
    await resolveProductCharge(product(), { expectedTenantId: TENANT, admin: client })
    expect(calls.every((c) => c.tenantId === TENANT)).toBe(true)
  })

  it('refuses a product from another tenant before pricing anything', async () => {
    const { client, calls } = fakeAdmin({})
    await expect(
      resolveProductCharge(product({ tenant_id: 'tenant-b' }), { expectedTenantId: TENANT, admin: client }),
    ).rejects.toThrow(/another tenant/)
    expect(calls).toHaveLength(0)
  })

  it('propagates FeeSplitUnavailableError for a student bearer with no split', async () => {
    const { client } = fakeAdmin({})
    await expect(resolveProductCharge(product(), { expectedTenantId: TENANT, admin: client })).rejects.toBeInstanceOf(
      FeeSplitUnavailableError,
    )
  })
})

describe('pendingCheckoutMatches', () => {
  const fresh = { amount: 125, currency: 'usd', feeBearer: 'student' as const }

  it('matches identical terms (numeric strings from PostgREST, any currency case)', () => {
    expect(pendingCheckoutMatches({ amount: '125.00', currency: 'USD', fee_bearer: 'student' }, fresh)).toBe(true)
  })

  it('rejects a leftover priced before the fee bearer flipped', () => {
    expect(pendingCheckoutMatches({ amount: 100, currency: 'usd', fee_bearer: 'school' }, fresh)).toBe(false)
  })

  it('rejects a changed amount or currency', () => {
    expect(pendingCheckoutMatches({ amount: 125.01, currency: 'usd', fee_bearer: 'student' }, fresh)).toBe(false)
    expect(pendingCheckoutMatches({ amount: 125, currency: 'eur', fee_bearer: 'student' }, fresh)).toBe(false)
  })
})

describe('call-site contract', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')
  const sites = [
    'app/[locale]/(public)/checkout/page.tsx',
    'app/api/stripe/create-payment-intent/route.ts',
    'app/api/payments/checkout/route.ts',
  ]

  it.each(sites)('%s prices products through lib/payments/product-charge, never its own revenue_splits read', (p) => {
    const src = read(p)
    expect(src).toMatch(/from ['"]@\/lib\/payments\/product-charge['"]/)
    expect(src).not.toMatch(/from\(['"]revenue_splits['"]\)/)
  })
})
