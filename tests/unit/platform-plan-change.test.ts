import { describe, it, expect } from 'vitest'
import { applyPortalPlanChange } from '@/lib/payments/platform-plan-change'

/**
 * Pins the portal plan-change CONTRACT (issue #461): the provider's price and
 * the DB plan may never disagree after the webhook. Over-limit downgrades revert
 * at the provider and leave the DB alone; if revert is impossible/fails, the DB
 * follows the provider;
 * the echo event of a revert is a no-op (loop terminates). Fluent fake records
 * writes, same approach as webhook-dispatch.test.ts.
 */

interface PlanRow {
  plan_id: string
  slug: string
  name: string | null
  transaction_fee_percent: number
  limits: { max_courses?: number; max_students?: number } | null
}

interface FakeConfig {
  newPlan?: PlanRow | null
  oldPlan?: PlanRow | null
  currentSub?: { plan_id: string; interval: string | null; plan_override_at?: string | null } | null
  courseCount?: number
  studentCount?: number
  adminUsers?: string[]
  /**
   * Provider price ids per plan, keyed by plan_id then interval. Since #601 these
   * live in `platform_plan_prices` rather than on `platform_plans`, so a plan
   * with no purchasable price is expressed by omitting it here — that is the
   * "revert impossible" case, not a null column on the plan row.
   */
  prices?: Record<string, Partial<Record<'monthly' | 'yearly', string>>>
}

interface Recorder {
  updates: { table: string; values: Record<string, unknown> }[]
  upserts: { table: string; values: Record<string, unknown> }[]
  inserts: { table: string; values: unknown }[]
  planSelects: string[]
  emails: { to: string; subject: string }[]
  reverts: { id: string; priceId: string }[]
}

function makeFakeAdmin(cfg: FakeConfig) {
  const calls: Recorder = {
    updates: [],
    upserts: [],
    inserts: [],
    planSelects: [],
    emails: [],
    reverts: [],
  }

  const prices = cfg.prices ?? DEFAULT_PLAN_PRICES

  function makeBuilder(table: string) {
    let lastInsert: unknown = null
    const filters: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {
      select(cols: string) {
        if (table === 'platform_plans') calls.planSelects.push(cols)
        return builder
      },
      update(values: Record<string, unknown>) {
        calls.updates.push({ table, values })
        return builder
      },
      upsert(values: Record<string, unknown>) {
        calls.upserts.push({ table, values })
        return builder
      },
      insert(values: unknown) {
        lastInsert = values
        calls.inserts.push({ table, values })
        return builder
      },
      eq(col: string, value: unknown) {
        filters[col] = value
        return builder
      },
      neq() {
        return builder
      },
      maybeSingle() {
        if (table === 'platform_plan_prices') {
          // price id -> plan (the portal event carries only the price)
          if (filters.provider_price_id) {
            const planId = Object.keys(prices).find((id) =>
              Object.values(prices[id]).includes(filters.provider_price_id as string)
            )
            return Promise.resolve({ data: planId ? { plan_id: planId } : null, error: null })
          }
          // plan + interval -> price id (resolving the revert target)
          const interval = filters.interval as 'monthly' | 'yearly'
          const priceId = prices[filters.plan_id as string]?.[interval] ?? null
          return Promise.resolve({
            data: priceId ? { provider_price_id: priceId } : null,
            error: null,
          })
        }
        if (table === 'platform_plans') {
          const planId = filters.plan_id
          const match = [cfg.newPlan, cfg.oldPlan].find((p) => p && p.plan_id === planId)
          return Promise.resolve({ data: match ?? null, error: null })
        }
        if (table === 'platform_subscriptions') {
          return Promise.resolve({ data: cfg.currentSub ?? null, error: null })
        }
        if (table === 'tenants') {
          return Promise.resolve({ data: { name: 'Test School' }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      single() {
        if (table === 'notifications' && lastInsert) {
          return Promise.resolve({ data: { id: 42 }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then(resolve: (v: unknown) => unknown) {
        if (table === 'courses') {
          return Promise.resolve({ count: cfg.courseCount ?? 0, error: null }).then(resolve)
        }
        if (table === 'tenant_users') {
          const admins = (cfg.adminUsers ?? []).map((user_id) => ({ user_id }))
          // Head-count student query and admin-list query both land here; the
          // count matters for the former, data for the latter.
          return Promise.resolve({ count: cfg.studentCount ?? 0, data: admins, error: null }).then(resolve)
        }
        return Promise.resolve({ data: null, error: null }).then(resolve)
      },
    }
    return builder
  }

  const admin = {
    from(table: string) {
      return makeBuilder(table)
    },
    auth: {
      admin: {
        getUserById(id: string) {
          return Promise.resolve({ data: { user: { email: `${id}@example.com` } }, error: null })
        },
      },
    },
  }

  const sendEmailFn = (options: { to: string; subject: string }) => {
    calls.emails.push({ to: options.to, subject: options.subject })
    return Promise.resolve(true)
  }

  // The revert callback the caller builds from the provider's own
  // `updateSubscription` (#603). Was a Stripe client; the module no longer
  // knows which provider it is putting back.
  function makeRevert(shouldThrow = false) {
    return (id: string, priceId: string) => {
      if (shouldThrow) return Promise.reject(new Error('provider down'))
      calls.reverts.push({ id, priceId })
      return Promise.resolve()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls, sendEmailFn: sendEmailFn as any, makeRevert }
}

// plan_id is a uuid in the real schema (platform_plans.plan_id) — fixtures
// use uuid strings so the no-op guard's key equality is exercised as strings.
const PRO_ID = 'f9318c3a-815d-448d-802e-cf356c2791a4'
const STARTER_ID = '205e06a0-611f-49b1-b916-5d9be6dcf5ca'

const PRO: PlanRow = {
  plan_id: PRO_ID,
  slug: 'pro',
  name: 'Pro',
  transaction_fee_percent: 2,
  limits: { max_courses: 100, max_students: 1000 },
}

const STARTER: PlanRow = {
  plan_id: STARTER_ID,
  slug: 'starter',
  name: 'Starter',
  transaction_fee_percent: 5,
  limits: { max_courses: 15, max_students: 200 },
}

/** Stands in for the `platform_plan_prices` rows both fixture plans have (#601). */
const DEFAULT_PLAN_PRICES: Record<string, Partial<Record<'monthly' | 'yearly', string>>> = {
  [PRO_ID]: { monthly: 'price_pro_m', yearly: 'price_pro_y' },
  [STARTER_ID]: { monthly: 'price_starter_m', yearly: 'price_starter_y' },
}

/** The normalized slice a provider webhook now hands the module (#603). */
function subscriptionEvent(priceId = 'price_starter_m') {
  return {
    provider: 'stripe',
    tenantId: 'tenant-1',
    providerSubscriptionId: 'sub_123',
    providerPriceId: priceId,
    interval: 'monthly' as const,
  }
}

describe('applyPortalPlanChange', () => {
  it('under-limit downgrade → applied: tenants.plan + platform_subscriptions.plan_id + revenue_splits updated, no provider call', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 10,
      studentCount: 100,
    })
    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      revertToPrice: makeRevert(),
      sendEmailFn,
    })
    expect(result.action).toBe('applied')
    expect(calls.updates.find((u) => u.table === 'tenants')?.values.plan).toBe('starter')
    expect(calls.updates.find((u) => u.table === 'platform_subscriptions')?.values.plan_id).toBe(STARTER_ID)
    expect(calls.upserts.find((u) => u.table === 'revenue_splits')?.values.platform_percentage).toBe(5)
    expect(calls.reverts).toHaveLength(0)
    expect(calls.emails).toHaveLength(0)
  })

  it('over-limit downgrade → reverted: provider pushed back to old price, DB plan untouched, admins notified', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 50, // over starter's 15
      studentCount: 100,
      adminUsers: ['admin-a', 'admin-b'],
    })
    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      revertToPrice: makeRevert(),
      sendEmailFn,
    })
    expect(result.action).toBe('reverted')
    expect(calls.reverts).toHaveLength(1)
    expect(calls.reverts[0]).toEqual({ id: 'sub_123', priceId: 'price_pro_m' })
    // DB plan must NOT change
    expect(calls.updates.find((u) => u.table === 'tenants')).toBeUndefined()
    expect(calls.updates.find((u) => u.table === 'platform_subscriptions')).toBeUndefined()
    expect(calls.upserts).toHaveLength(0)
    // Recorded + notified
    expect(calls.inserts.find((i) => i.table === 'notifications')).toBeDefined()
    expect(calls.inserts.find((i) => i.table === 'user_notifications')).toBeDefined()
    expect(calls.emails.map((e) => e.to).sort()).toEqual([
      'admin-a@example.com',
      'admin-b@example.com',
    ])
  })

  it('echo event after revert (price maps to current plan) → complete no-op', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin({
      newPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 50,
    })
    const result = await applyPortalPlanChange(subscriptionEvent('price_pro_m'), {
      admin,
      revertToPrice: makeRevert(),
      sendEmailFn,
    })
    expect(result.action).toBe('noop')
    expect(calls.updates).toHaveLength(0)
    expect(calls.upserts).toHaveLength(0)
    expect(calls.reverts).toHaveLength(0)
    expect(calls.emails).toHaveLength(0)
  })

  it('regression: the plan lookup selects `limits` (the old inline guard never did, so it was dead)', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
    })
    await applyPortalPlanChange(subscriptionEvent(), { admin, revertToPrice: makeRevert(), sendEmailFn })
    expect(calls.planSelects.length).toBeGreaterThan(0)
    for (const cols of calls.planSelects) {
      expect(cols).toContain('limits')
    }
  })

  it('revert impossible (old plan has no Stripe prices) → downgrade applied to DB + admins warned', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      // PRO absent from `prices` — it has no purchasable Stripe price, so the
      // revert has nothing to revert to.
      prices: { [STARTER_ID]: { monthly: 'price_starter_m', yearly: 'price_starter_y' } },
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 50,
      adminUsers: ['admin-a'],
    })
    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      revertToPrice: makeRevert(),
      sendEmailFn,
    })
    expect(result.action).toBe('applied_over_limit')
    expect(calls.reverts).toHaveLength(0)
    expect(calls.updates.find((u) => u.table === 'tenants')?.values.plan).toBe('starter')
    expect(calls.inserts.find((i) => i.table === 'notifications')).toBeDefined()
    expect(calls.emails).toHaveLength(1)
  })

  it('revert fails → falls through: DB follows the provider (applied_over_limit)', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 50,
      adminUsers: ['admin-a'],
    })
    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      revertToPrice: makeRevert(true),
      sendEmailFn,
    })
    expect(result.action).toBe('applied_over_limit')
    expect(calls.updates.find((u) => u.table === 'tenants')?.values.plan).toBe('starter')
    expect(calls.emails).toHaveLength(1)
  })

  it('unknown price → ignored, nothing written', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin({ newPlan: null })
    const result = await applyPortalPlanChange(subscriptionEvent('price_unknown'), {
      admin,
      revertToPrice: makeRevert(),
      sendEmailFn,
    })
    expect(result.action).toBe('ignored')
    expect(calls.updates).toHaveLength(0)
    expect(calls.reverts).toHaveLength(0)
  })
})

/**
 * Issue #546 §3. A super admin comps a school from Starter to Pro with
 * `forceTenantPlanChange`, which never calls Stripe. Stripe therefore keeps
 * billing Starter, and the next routine `customer.subscription.updated` carries
 * the Starter price — which this module read as a Pro→Starter downgrade. The
 * school is over Starter's limits (that is WHY it was comped), so the enforcement
 * path "reverted" Stripe onto the PRO price: the school gets billed for the plan
 * it was given for free, by the code whose stated purpose is protecting an
 * invariant. #468 item 2 introduced the coupling; the dead webhook (#544) masked
 * it until that was fixed.
 */
describe('applyPortalPlanChange — super-admin plan override (#546 §3)', () => {
  const comped = (override: string | null) => ({
    newPlan: STARTER,
    oldPlan: PRO,
    currentSub: { plan_id: PRO.plan_id, interval: 'monthly', plan_override_at: override },
    // Over Starter's 15-course limit — the reason the comp exists.
    courseCount: 30,
    adminUsers: ['admin-a'],
  })

  it('never reprices a comped tenant on Stripe', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin(comped('2026-07-20T00:00:00.000Z'))

    const result = await applyPortalPlanChange(subscriptionEvent('price_starter_m'), {
      admin,
      revertToPrice: makeRevert(),
      sendEmailFn,
    })

    expect(result).toMatchObject({ action: 'ignored' })
    expect(calls.reverts).toHaveLength(0)
    expect(calls.updates).toHaveLength(0)
    expect(calls.upserts).toHaveLength(0)
    expect(calls.emails).toHaveLength(0)
  })

  it('control: without the override marker the same event reprices Stripe onto the comped plan', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin(comped(null))

    const result = await applyPortalPlanChange(subscriptionEvent('price_starter_m'), {
      admin,
      revertToPrice: makeRevert(),
      sendEmailFn,
    })

    expect(result.action).toBe('reverted')
    const items = [{ price: calls.reverts[0].priceId }]
    expect(items[0].price).toBe('price_pro_m')
  })

  it('clearing the override lets portal changes reconcile again', async () => {
    const { admin, calls, sendEmailFn, makeRevert } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly', plan_override_at: null },
      courseCount: 5,
      studentCount: 10,
    })

    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      revertToPrice: makeRevert(),
      sendEmailFn,
    })

    expect(result.action).toBe('applied')
    expect(calls.updates.find((u) => u.table === 'tenants')?.values.plan).toBe('starter')
  })
})
