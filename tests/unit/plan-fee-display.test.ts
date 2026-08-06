import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase, type Db } from './support/fake-supabase'

/**
 * Issue #613 — the transaction fee a school reads on its own billing page.
 *
 * `getSubscriptionStatus()` defaulted the fee with `||`, so a plan whose fee is
 * legitimately `0` was indistinguishable from a missing plan row and fell
 * through to the Free-plan rate. Business and Enterprise are exactly the two
 * plans with a 0% fee, so the only schools shown a wrong number were the two
 * paying the most for a 0% fee — while `usePlanFeatures()`, reading the same
 * column with `??` one file over, told them 0%.
 *
 * The fallback itself is still wanted: a tenant whose `plan` slug matches no
 * `platform_plans` row must read 10%, not `undefined%`.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const USER = 'user-admin-1'

let db: Db

function makeClient() {
  return createFakeSupabase(db, {
    embeds: {
      platform_plans: { table: 'platform_plans', localKey: 'plan_id', foreignKey: 'plan_id' },
    },
    conflictKeys: { platform_subscriptions: 'tenant_id', revenue_splits: 'tenant_id' },
  }).client
}

vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(makeClient()) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeClient() }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(TENANT),
  getCurrentUserId: () => Promise.resolve(USER),
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: () => Promise.resolve('admin') }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/email/send', () => ({ sendEmail: () => Promise.resolve(true) }))
vi.mock('@/lib/billing/access-cutoff', () => ({
  reconcileAccessCutoff: () => Promise.resolve({ action: 'none' }),
}))

import { getSubscriptionStatus } from '@/app/actions/admin/billing'

/** The seeded fees, including the two zeroes that triggered the bug. */
const PLANS = [
  { slug: 'free', name: 'Free', fee: 10, limits: { max_courses: 5, max_students: 50 } },
  { slug: 'starter', name: 'Starter', fee: 5, limits: { max_courses: 15, max_students: 200 } },
  { slug: 'pro', name: 'Pro', fee: 2, limits: { max_courses: 100, max_students: 1000 } },
  { slug: 'business', name: 'Business', fee: 0, limits: { max_courses: -1, max_students: 5000 } },
  { slug: 'enterprise', name: 'Enterprise', fee: 0, limits: { max_courses: -1, max_students: -1 } },
]

beforeEach(() => {
  db = {
    tenants: [{ id: TENANT, name: 'Test School', plan: 'business', billing_status: 'active' }],
    tenant_users: [{ tenant_id: TENANT, user_id: USER, role: 'admin', status: 'active' }],
    platform_plans: PLANS.map((p) => ({
      plan_id: `plan-${p.slug}`,
      slug: p.slug,
      name: p.name,
      is_active: true,
      price_monthly: 0,
      price_yearly: 0,
      transaction_fee_percent: p.fee,
      limits: p.limits,
      features: {},
    })),
    platform_subscriptions: [],
    courses: [],
    platform_payment_requests: [],
    revenue_splits: [],
  }
})

describe('#613 — the fee shown on the billing page', () => {
  it('reports 0 for Business rather than the Free-plan default', async () => {
    const status = await getSubscriptionStatus()

    expect(status.plan).toBe('business')
    expect(status.transactionFeePercent).toBe(0)
  })

  it('reports 0 for Enterprise too', async () => {
    db.tenants[0].plan = 'enterprise'

    const status = await getSubscriptionStatus()

    expect(status.plan).toBe('enterprise')
    expect(status.transactionFeePercent).toBe(0)
  })

  it('still reports each paid plan its own non-zero fee', async () => {
    // Guards the other direction: the fix must not blanket-zero the fee.
    for (const { slug, fee } of PLANS) {
      db.tenants[0].plan = slug
      expect((await getSubscriptionStatus()).transactionFeePercent).toBe(fee)
    }
  })

  it('keeps the 10% fallback when the tenant is on a plan with no row', async () => {
    db.tenants[0].plan = 'a-slug-that-was-deleted'

    const status = await getSubscriptionStatus()

    expect(status.transactionFeePercent).toBe(10)
  })
})
