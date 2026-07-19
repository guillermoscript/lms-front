import { describe, it, expect } from 'vitest'
import { applyPortalPlanChange } from '@/lib/payments/platform-plan-change'

/**
 * Pins the portal plan-change CONTRACT (issue #461): Stripe price and DB plan
 * may never disagree after the webhook. Over-limit downgrades revert Stripe and
 * leave the DB alone; if revert is impossible/fails, the DB follows Stripe;
 * the echo event of a revert is a no-op (loop terminates). Fluent fake records
 * writes, same approach as webhook-dispatch.test.ts.
 */

interface PlanRow {
  plan_id: number
  slug: string
  name: string | null
  transaction_fee_percent: number
  limits: { max_courses?: number; max_students?: number } | null
  stripe_price_id_monthly: string | null
  stripe_price_id_yearly: string | null
}

interface FakeConfig {
  newPlan?: PlanRow | null
  oldPlan?: PlanRow | null
  currentSub?: { plan_id: number; interval: string | null } | null
  courseCount?: number
  studentCount?: number
  adminUsers?: string[]
}

interface Recorder {
  updates: { table: string; values: Record<string, unknown> }[]
  upserts: { table: string; values: Record<string, unknown> }[]
  inserts: { table: string; values: unknown }[]
  planSelects: string[]
  emails: { to: string; subject: string }[]
  stripeUpdates: { id: string; params: Record<string, unknown> }[]
}

function makeFakeAdmin(cfg: FakeConfig) {
  const calls: Recorder = {
    updates: [],
    upserts: [],
    inserts: [],
    planSelects: [],
    emails: [],
    stripeUpdates: [],
  }

  function makeBuilder(table: string) {
    let usedOr = false
    let lastInsert: unknown = null
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
      or() {
        usedOr = true
        return builder
      },
      eq() {
        return builder
      },
      neq() {
        return builder
      },
      maybeSingle() {
        if (table === 'platform_plans') {
          return Promise.resolve({ data: usedOr ? (cfg.newPlan ?? null) : (cfg.oldPlan ?? null), error: null })
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

  function makeStripe(shouldThrow = false) {
    return {
      subscriptions: {
        update(id: string, params: Record<string, unknown>) {
          if (shouldThrow) return Promise.reject(new Error('stripe down'))
          calls.stripeUpdates.push({ id, params })
          return Promise.resolve({})
        },
      },
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls, sendEmailFn: sendEmailFn as any, makeStripe }
}

const PRO: PlanRow = {
  plan_id: 3,
  slug: 'pro',
  name: 'Pro',
  transaction_fee_percent: 2,
  limits: { max_courses: 100, max_students: 1000 },
  stripe_price_id_monthly: 'price_pro_m',
  stripe_price_id_yearly: 'price_pro_y',
}

const STARTER: PlanRow = {
  plan_id: 2,
  slug: 'starter',
  name: 'Starter',
  transaction_fee_percent: 5,
  limits: { max_courses: 15, max_students: 200 },
  stripe_price_id_monthly: 'price_starter_m',
  stripe_price_id_yearly: 'price_starter_y',
}

function subscriptionEvent(priceId = 'price_starter_m') {
  return {
    id: 'sub_123',
    metadata: { tenant_id: 'tenant-1' },
    items: { data: [{ id: 'si_1', price: { id: priceId, recurring: { interval: 'month' } } }] },
  }
}

describe('applyPortalPlanChange', () => {
  it('under-limit downgrade → applied: tenants.plan + platform_subscriptions.plan_id + revenue_splits updated, no Stripe call', async () => {
    const { admin, calls, sendEmailFn, makeStripe } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 10,
      studentCount: 100,
    })
    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      stripe: makeStripe(),
      sendEmailFn,
    })
    expect(result.action).toBe('applied')
    expect(calls.updates.find((u) => u.table === 'tenants')?.values.plan).toBe('starter')
    expect(calls.updates.find((u) => u.table === 'platform_subscriptions')?.values.plan_id).toBe(2)
    expect(calls.upserts.find((u) => u.table === 'revenue_splits')?.values.platform_percentage).toBe(5)
    expect(calls.stripeUpdates).toHaveLength(0)
    expect(calls.emails).toHaveLength(0)
  })

  it('over-limit downgrade → reverted: Stripe pushed back to old price, DB plan untouched, admins notified', async () => {
    const { admin, calls, sendEmailFn, makeStripe } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 50, // over starter's 15
      studentCount: 100,
      adminUsers: ['admin-a', 'admin-b'],
    })
    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      stripe: makeStripe(),
      sendEmailFn,
    })
    expect(result.action).toBe('reverted')
    expect(calls.stripeUpdates).toHaveLength(1)
    expect(calls.stripeUpdates[0].id).toBe('sub_123')
    expect(calls.stripeUpdates[0].params).toMatchObject({
      items: [{ id: 'si_1', price: 'price_pro_m' }],
      proration_behavior: 'none',
    })
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
    const { admin, calls, sendEmailFn, makeStripe } = makeFakeAdmin({
      newPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 50,
    })
    const result = await applyPortalPlanChange(subscriptionEvent('price_pro_m'), {
      admin,
      stripe: makeStripe(),
      sendEmailFn,
    })
    expect(result.action).toBe('noop')
    expect(calls.updates).toHaveLength(0)
    expect(calls.upserts).toHaveLength(0)
    expect(calls.stripeUpdates).toHaveLength(0)
    expect(calls.emails).toHaveLength(0)
  })

  it('regression: the plan lookup selects `limits` (the old inline guard never did, so it was dead)', async () => {
    const { admin, calls, sendEmailFn, makeStripe } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
    })
    await applyPortalPlanChange(subscriptionEvent(), { admin, stripe: makeStripe(), sendEmailFn })
    expect(calls.planSelects.length).toBeGreaterThan(0)
    for (const cols of calls.planSelects) {
      expect(cols).toContain('limits')
    }
  })

  it('revert impossible (old plan has no Stripe prices) → downgrade applied to DB + admins warned', async () => {
    const { admin, calls, sendEmailFn, makeStripe } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: { ...PRO, stripe_price_id_monthly: null, stripe_price_id_yearly: null },
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 50,
      adminUsers: ['admin-a'],
    })
    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      stripe: makeStripe(),
      sendEmailFn,
    })
    expect(result.action).toBe('applied_over_limit')
    expect(calls.stripeUpdates).toHaveLength(0)
    expect(calls.updates.find((u) => u.table === 'tenants')?.values.plan).toBe('starter')
    expect(calls.inserts.find((i) => i.table === 'notifications')).toBeDefined()
    expect(calls.emails).toHaveLength(1)
  })

  it('Stripe revert fails → falls through: DB follows Stripe (applied_over_limit)', async () => {
    const { admin, calls, sendEmailFn, makeStripe } = makeFakeAdmin({
      newPlan: STARTER,
      oldPlan: PRO,
      currentSub: { plan_id: PRO.plan_id, interval: 'monthly' },
      courseCount: 50,
      adminUsers: ['admin-a'],
    })
    const result = await applyPortalPlanChange(subscriptionEvent(), {
      admin,
      stripe: makeStripe(true),
      sendEmailFn,
    })
    expect(result.action).toBe('applied_over_limit')
    expect(calls.updates.find((u) => u.table === 'tenants')?.values.plan).toBe('starter')
    expect(calls.emails).toHaveLength(1)
  })

  it('unknown price → ignored, nothing written', async () => {
    const { admin, calls, sendEmailFn, makeStripe } = makeFakeAdmin({ newPlan: null })
    const result = await applyPortalPlanChange(subscriptionEvent('price_unknown'), {
      admin,
      stripe: makeStripe(),
      sendEmailFn,
    })
    expect(result.action).toBe('ignored')
    expect(calls.updates).toHaveLength(0)
    expect(calls.stripeUpdates).toHaveLength(0)
  })
})
