/**
 * `tenants.billing_mode` (#982): internal / comped / paid.
 *
 *  - internal: never cut off by the over-limit sweep (a stale cutoff is lifted),
 *    never touched by the subscription-expiry or fee-enforcement crons.
 *    A `paid` control with the identical setup DOES get a cutoff, so the
 *    internal assertions can fail.
 *  - comped: the BEFORE INSERT trigger snapshots the school share from
 *    fee_percent_override (5 → 95, null → 100).
 *  - paid: snapshot still comes from revenue_splits.school_percentage.
 */
import type { APIRequestContext } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from './utils/test'
import { BASE } from './utils/constants'
import {
  DAY_MS,
  SEEDED,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  insertCourse,
  runEnforceSweep,
  setTenantPlan,
  tenantRow,
  upsertTinyPlan,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const INTERNAL: QaTenant = {
  id: '00000000-0000-0000-0000-000000000982',
  slug: 'qa-billing-mode-internal',
  name: 'QA Billing Mode Internal',
  planSlug: 'e2e-tiny-bm-internal',
}
const CONTROL: QaTenant = {
  id: '00000000-0000-0000-0000-000000000983',
  slug: 'qa-billing-mode-control',
  name: 'QA Billing Mode Control',
  planSlug: 'e2e-tiny-bm-control',
}
const FEE: QaTenant = {
  id: '00000000-0000-0000-0000-000000000984',
  slug: 'qa-billing-mode-fee',
  name: 'QA Billing Mode Fee',
  planSlug: 'e2e-tiny-bm-fee',
}
const ALL = [INTERNAL, CONTROL, FEE]

test.describe.configure({ mode: 'serial' })

async function overLimitTenant(admin: SupabaseClient, t: QaTenant, mode: 'paid' | 'internal') {
  await upsertTinyPlan(admin, t.planSlug, { max_courses: 1, max_students: -1 })
  await createQaTenant(admin, t, 'free')
  await insertCourse(admin, t.id, `E2E #982 ${t.slug} a`)
  await insertCourse(admin, t.id, `E2E #982 ${t.slug} b`)
  const { error } = await admin.from('tenants').update({ billing_mode: mode }).eq('id', t.id)
  if (error) throw new Error(`could not set billing_mode: ${error.message}`)
  await setTenantPlan(admin, t.id, t.planSlug) // 2 courses on a 1-course plan
}

async function cron(request: APIRequestContext, path: string) {
  const res = await request.get(`${BASE}/api/cron/${path}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    timeout: 60_000,
  })
  expect(res.status(), await res.text()).toBe(200)
}

async function insertSaleSnapshot(admin: SupabaseClient, t: QaTenant, planId: number): Promise<number> {
  const { data, error } = await admin
    .from('transactions')
    .insert({
      user_id: SEEDED.student.id,
      payment_provider: 'manual',
      payment_method: 'manual',
      currency: 'usd',
      plan_id: planId,
      amount: 100,
      status: 'successful',
      tenant_id: t.id,
    })
    .select('school_percentage_snapshot')
    .single()
  if (error) throw new Error(`could not insert sale: ${error.message}`)
  return Number(data.school_percentage_snapshot)
}

test.describe('billing_mode (#982)', () => {
  test.skip(!process.env.CRON_SECRET, 'CRON_SECRET is required to call the crons')

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test.beforeAll(async () => {
    const admin = getAdmin()
    for (const t of ALL) {
      await admin.from('transactions').delete().eq('tenant_id', t.id)
      await admin.from('plans').delete().eq('tenant_id', t.id)
      await destroyQaTenant(admin, t)
    }
  })

  test.afterAll(async () => {
    const admin = getAdmin()
    for (const t of ALL) {
      await admin.from('transactions').delete().eq('tenant_id', t.id)
      await admin.from('plans').delete().eq('tenant_id', t.id)
      await destroyQaTenant(admin, t)
    }
  })

  test('paid control over the limit gets a cutoff scheduled', async ({ request }) => {
    const admin = getAdmin()
    await overLimitTenant(admin, CONTROL, 'paid')
    await overLimitTenant(admin, INTERNAL, 'internal')

    const sweep = await runEnforceSweep(request)
    expect(sweep.success).toBe(true)
    expect((await tenantRow(admin, CONTROL.id)).access_cutoff_at).not.toBeNull()
  })

  test('internal over the limit is never cut off by the sweep', async ({ request }) => {
    const admin = getAdmin()
    const before = await tenantRow(admin, INTERNAL.id)
    expect(before.access_cutoff_at).toBeNull()

    // Same sweep as the control above (idempotent for it), plus one more.
    await runEnforceSweep(request)
    const after = await tenantRow(admin, INTERNAL.id)
    expect(after.access_cutoff_at).toBeNull()
    expect(after.plan).toBe(INTERNAL.planSlug)
    expect(after.billing_status).toBe(before.billing_status)
  })

  test('a stale cutoff on an internal tenant is cleared by the sweep', async ({ request }) => {
    const admin = getAdmin()
    const { error } = await admin
      .from('tenants')
      .update({ access_cutoff_at: new Date(Date.now() - 2 * DAY_MS).toISOString() })
      .eq('id', INTERNAL.id)
    expect(error).toBeNull()

    const sweep = await runEnforceSweep(request)
    expect(sweep.cleared).toBeGreaterThanOrEqual(1)
    expect((await tenantRow(admin, INTERNAL.id)).access_cutoff_at).toBeNull()
  })

  test('expiry and fee crons leave an internal tenant untouched', async ({ request }) => {
    const admin = getAdmin()
    const { data: plan } = await admin.from('platform_plans').select('plan_id').eq('slug', INTERNAL.planSlug).single()
    // A lapsed subscription well past the 7-day grace: for a paid tenant this
    // downgrades to free; for internal it must not.
    const { error: subError } = await admin.from('platform_subscriptions').insert({
      tenant_id: INTERNAL.id,
      plan_id: plan!.plan_id,
      status: 'active',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: new Date(Date.now() - 60 * DAY_MS).toISOString(),
      current_period_end: new Date(Date.now() - 30 * DAY_MS).toISOString(),
      cancel_at_period_end: false,
    })
    expect(subError).toBeNull()
    await admin
      .from('tenants')
      .update({ billing_status: 'active', billing_period_end: new Date(Date.now() - 30 * DAY_MS).toISOString() })
      .eq('id', INTERNAL.id)

    const before = await tenantRow(admin, INTERNAL.id)
    await cron(request, 'expire-platform-subscriptions')
    await cron(request, 'enforce-platform-fees')

    const after = await tenantRow(admin, INTERNAL.id)
    expect(after.plan).toBe(INTERNAL.planSlug)
    expect(after.billing_status).toBe(before.billing_status)
    expect(after.access_cutoff_at).toBeNull()
    const { data: mode } = await admin.from('tenants').select('billing_mode').eq('id', INTERNAL.id).single()
    expect(mode!.billing_mode).toBe('internal')
    const { data: sub } = await admin.from('platform_subscriptions').select('status').eq('tenant_id', INTERNAL.id).single()
    expect(sub!.status).toBe('active')
  })

  test('comped with fee_percent_override=5 snapshots 95; null snapshots 100', async () => {
    const admin = getAdmin()
    await upsertTinyPlan(admin, FEE.planSlug, { max_courses: -1, max_students: -1 })
    await createQaTenant(admin, FEE, 'free')
    const { data: plan, error: planError } = await admin
      .from('plans')
      .insert({ plan_name: 'E2E #982 plan', price: 100, duration_in_days: 30, currency: 'usd', payment_provider: 'manual', tenant_id: FEE.id })
      .select('plan_id')
      .single()
    if (planError) throw new Error(planError.message)

    const { error } = await admin
      .from('tenants')
      .update({ billing_mode: 'comped', fee_percent_override: 5 })
      .eq('id', FEE.id)
    expect(error).toBeNull()
    expect(await insertSaleSnapshot(admin, FEE, plan.plan_id)).toBe(95)

    await admin.from('tenants').update({ fee_percent_override: null }).eq('id', FEE.id)
    expect(await insertSaleSnapshot(admin, FEE, plan.plan_id)).toBe(100)
  })

  test('paid still snapshots revenue_splits.school_percentage', async () => {
    const admin = getAdmin()
    const { data: plan } = await admin.from('plans').select('plan_id').eq('tenant_id', FEE.id).single()
    await admin.from('tenants').update({ billing_mode: 'paid', fee_percent_override: 5 }).eq('id', FEE.id)
    const { error } = await admin
      .from('revenue_splits')
      .upsert({ tenant_id: FEE.id, platform_percentage: 15, school_percentage: 85 }, { onConflict: 'tenant_id' })
    expect(error).toBeNull()
    // override is only honoured for comped: paid ignores it.
    expect(await insertSaleSnapshot(admin, FEE, plan!.plan_id)).toBe(85)
  })
})
