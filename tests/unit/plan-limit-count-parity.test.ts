import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase, type Db } from './support/fake-supabase'

/**
 * Issue #546 §5 — four different definitions of "how many courses does this
 * tenant have".
 *
 *   lib/billing/plan-limits.ts     (downgrade pre-flight)  → non-archived
 *   lib/billing/access-cutoff.ts   (cutoff reconciler)     → non-archived
 *   app/actions/teacher/courses.ts (creation enforcement)  → ALL courses
 *   app/actions/admin/billing.ts   (the number shown)      → ALL courses
 *
 * plus a hardcoded `PLAN_LIMITS_FALLBACK` map as a fourth source of truth for
 * the limit itself. A school with 30 courses (20 archived) on Pro saw 30/100 on
 * its billing page, was approved to downgrade to Starter because 10 active ≤ 15,
 * and then could not create a single course because enforcement counted 30 ≥ 15
 * — while the pre-flight's error text told it to archive courses, which is
 * exactly what it had already done.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const USER = 'user-admin-1'
const PLAN_PRO = 'plan-pro'
const PLAN_STARTER = 'plan-starter'

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
import { checkCourseLimit } from '@/app/actions/teacher/courses'
import { checkPlanLimits } from '@/lib/billing/plan-limits'
import type { SupabaseClient } from '@supabase/supabase-js'

/** The fake implements the slice of the client these paths touch. */
const asClient = () => makeClient() as unknown as SupabaseClient

function seedCourses(active: number, archived: number) {
  db.courses = [
    ...Array.from({ length: active }, (_, i) => ({
      course_id: i + 1,
      tenant_id: TENANT,
      status: i % 2 === 0 ? 'published' : 'draft',
    })),
    ...Array.from({ length: archived }, (_, i) => ({
      course_id: 1000 + i,
      tenant_id: TENANT,
      status: 'archived',
    })),
    // Another tenant's courses must never be counted for this one.
    { course_id: 9999, tenant_id: 'other-tenant', status: 'published' },
  ]
}

beforeEach(() => {
  db = {
    tenants: [{ id: TENANT, name: 'Test School', plan: 'pro', billing_status: 'active' }],
    tenant_users: [{ tenant_id: TENANT, user_id: USER, role: 'admin', status: 'active' }],
    platform_plans: [
      {
        plan_id: PLAN_PRO,
        slug: 'pro',
        name: 'Pro',
        is_active: true,
        price_monthly: 29,
        price_yearly: 290,
        transaction_fee_percent: 2,
        limits: { max_courses: 100, max_students: 1000 },
      },
      {
        plan_id: PLAN_STARTER,
        slug: 'starter',
        name: 'Starter',
        is_active: true,
        price_monthly: 9,
        price_yearly: 90,
        transaction_fee_percent: 5,
        limits: { max_courses: 15, max_students: 200 },
      },
    ],
    platform_subscriptions: [
      {
        tenant_id: TENANT,
        plan_id: PLAN_PRO,
        status: 'active',
        interval: 'monthly',
        payment_provider: 'manual',
        cancel_at_period_end: false,
        current_period_end: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      },
    ],
    courses: [],
    platform_payment_requests: [],
    revenue_splits: [],
  }
  seedCourses(10, 20)
})

describe('#546 §5 — one course count everywhere', () => {
  it('agrees across the billing page, the pre-flight and creation enforcement', async () => {
    const shown = await getSubscriptionStatus()
    const enforcement = await checkCourseLimit()
    const preflight = await checkPlanLimits(asClient(), TENANT, { slug: 'starter' })

    expect(shown.usage.courses.current).toBe(10)
    expect(enforcement.currentCount).toBe(10)
    expect(preflight.usage.courses).toBe(10)
    expect(new Set([shown.usage.courses.current, enforcement.currentCount, preflight.usage.courses]).size).toBe(1)
  })

  it('lets a school create courses on the plan a downgrade pre-flight approved', async () => {
    // Approved: 10 active ≤ Starter's 15. Enforcement used to see 30 ≥ 15 and
    // refuse, with an error telling the school to archive courses it had
    // already archived.
    const preflight = await checkPlanLimits(asClient(), TENANT, { slug: 'starter' })
    expect(preflight.ok).toBe(true)

    db.tenants[0].plan = 'starter'
    const enforcement = await checkCourseLimit()

    expect(enforcement.plan).toBe('starter')
    expect(enforcement.limit).toBe(15)
    expect(enforcement.canCreate).toBe(true)
  })

  it('still blocks creation when the ACTIVE count is at the limit', async () => {
    db.tenants[0].plan = 'starter'
    seedCourses(15, 4)

    const enforcement = await checkCourseLimit()

    expect(enforcement.currentCount).toBe(15)
    expect(enforcement.canCreate).toBe(false)
  })

  it('reads the limit from platform_plans instead of the deleted fallback map', async () => {
    db.tenants[0].plan = 'starter'
    // The hardcoded map said starter = 15 no matter what the row said; the
    // table is now the only source of truth.
    ;(db.platform_plans[1] as { limits: { max_courses: number } }).limits = { max_courses: 3 }
    seedCourses(4, 0)

    const enforcement = await checkCourseLimit()

    expect(enforcement.limit).toBe(3)
    expect(enforcement.canCreate).toBe(false)
  })

  it('treats -1 as unlimited', async () => {
    db.tenants[0].plan = 'starter'
    ;(db.platform_plans[1] as { limits: { max_courses: number } }).limits = { max_courses: -1 }
    seedCourses(500, 0)

    const enforcement = await checkCourseLimit()

    expect(enforcement.limit).toBe(-1)
    expect(enforcement.canCreate).toBe(true)
  })
})
