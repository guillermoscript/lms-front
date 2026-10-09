/**
 * Platform fee ledger lifecycle, end to end (#929, docs/PLATFORM_FEE_LEDGER_DESIGN.md §6).
 *
 * One dedicated tenant (plus a hidden plan row, plan-gate-fixtures pattern):
 *   1. Seeded manual (`bearsPlatformFee: false`) sales accrue a balance that
 *      the admin earnings page's balance card shows.
 *   2. `/api/cron/enforce-platform-fees?dryRun=1` reports the would-act set
 *      and writes nothing.
 *   3. In `enforce` mode, once the school is overdue past the grace period,
 *      the cron sets `tenant_fee_standing.blocked_at`; a new sale (checkout
 *      page, transactions INSERT, free self-enroll) is refused with the neutral
 *      sales_blocked UX / LM003, while a held subscription's renewal and an
 *      existing student's course access still pass.
 *   4. Manual pay-now (admin bank-transfer request → super admin confirms)
 *      clears the balance and lifts the block immediately.
 *   5. The default tenant is never blocked, however overdue.
 *
 * `platform_fee_config.enforcement_mode` is set to `enforce` here and restored
 * to its original value in afterAll; every row this file creates is removed,
 * including standing/statement rows the cron wrote for other tenants. The cron
 * has no clock param, so the spec backdates `transaction_date` and
 * `overdue_since` instead. Run with `--workers=1` on lvh.me.
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { login } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'
import {
  DAY_MS,
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  insertCourse,
  setTenantPlan,
  tenantBase,
  upsertTinyPlan,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000929',
  slug: 'qa-fee-lifecycle',
  name: 'QA Fee Lifecycle',
  planSlug: 'e2e-tiny-fee-lifecycle',
}
const QA_BASE = tenantBase(QA.slug)
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'

// No revenue_splits row → the insert trigger snapshots 80% school share, so
// the platform fee is 20% of each sale.
const OVERDUE_SALE = 50 // 70 days ago → fee 10.00, overdue
const CURRENT_SALE = 25 // this month (plan) → fee 5.00, not yet due
const EXPECTED_OWED = 15

type StandingRow = Record<string, unknown> & { tenant_id: string }

let originalMode: string | null = null
let standingBefore: StandingRow[] = []
let statementsBefore = new Set<string>()

let paidCourseId: number
let stripeCourseId: number
let openManualProductId: number
let freeCourseId: number
let heldPlanId: number
let otherPlanId: number

test.describe.configure({ mode: 'serial' })

async function setMode(admin: SupabaseClient, mode: string) {
  const { error } = await admin.from('platform_fee_config').update({ enforcement_mode: mode }).eq('id', true)
  if (error) throw new Error(`could not set enforcement_mode=${mode}: ${error.message}`)
}

interface CronResult {
  success: boolean
  mode: string
  dryRun: boolean
  blocked: number
  actions?: { tenantId: string; action: string }[]
}

async function runFeeCron(request: APIRequestContext, dryRun = false): Promise<CronResult> {
  const res = await request.get(`${BASE}/api/cron/enforce-platform-fees${dryRun ? '?dryRun=1' : ''}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    timeout: 60_000,
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as CronResult
}

async function standing(admin: SupabaseClient, tenantId: string) {
  const { data, error } = await admin
    .from('tenant_fee_standing')
    .select('state, overdue_since, blocked_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function isBlocked(admin: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await admin.rpc('is_tenant_sales_blocked', { _tenant_id: tenantId })
  if (error) throw error
  return data === true
}

async function insertProduct(admin: SupabaseClient, name: string, price: number, provider: string, courseId: number) {
  const { data, error } = await admin
    .from('products')
    .insert({ name, price, currency: 'usd', payment_provider: provider, status: 'active', tenant_id: QA.id })
    .select('product_id')
    .single()
  if (error) throw new Error(`could not insert product ${name}: ${error.message}`)
  const { error: linkError } = await admin
    .from('product_courses')
    .insert({ product_id: data.product_id, course_id: courseId, tenant_id: QA.id })
  if (linkError) throw new Error(`could not link product ${name}: ${linkError.message}`)
  return data.product_id as number
}

async function insertPlan(admin: SupabaseClient, name: string, price: number) {
  const { data, error } = await admin
    .from('plans')
    .insert({ plan_name: name, price, duration_in_days: 30, currency: 'usd', payment_provider: 'manual', tenant_id: QA.id })
    .select('plan_id')
    .single()
  if (error) throw new Error(`could not insert plan ${name}: ${error.message}`)
  return data.plan_id as number
}

/** A new transactions row, as a checkout route would insert it (service role). */
function insertTxn(admin: SupabaseClient, row: Record<string, unknown>) {
  return admin
    .from('transactions')
    .insert({ user_id: SEEDED.student.id, payment_provider: 'manual', payment_method: 'manual', currency: 'usd', ...row })
    .select('transaction_id')
    .single()
}

async function studentClient(): Promise<SupabaseClient> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error } = await client.auth.signInWithPassword({
    email: SEEDED.student.email,
    password: SEEDED.student.password,
  })
  if (error) throw new Error(`student sign-in failed: ${error.message}`)
  return client
}

test.describe('platform fee lifecycle (#929)', () => {
  test.skip(!process.env.CRON_SECRET, 'CRON_SECRET is required to call the fee cron')

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state and the kill switch are shared')
  })

  test.beforeAll(async () => {
    const admin = getAdmin()

    const { data: cfg, error: cfgError } = await admin
      .from('platform_fee_config')
      .select('enforcement_mode')
      .eq('id', true)
      .single()
    if (cfgError) throw new Error(`could not read platform_fee_config: ${cfgError.message}`)
    originalMode = cfg.enforcement_mode as string

    const { data: rows } = await admin.from('tenant_fee_standing').select('*').neq('tenant_id', QA.id)
    standingBefore = (rows ?? []) as StandingRow[]
    const { data: stmts } = await admin.from('platform_fee_statements').select('statement_id')
    statementsBefore = new Set((stmts ?? []).map((s) => s.statement_id as string))

    await destroyQaTenant(admin, QA)
    await upsertTinyPlan(admin, QA.planSlug, { max_courses: 10, max_students: -1 })
    await createQaTenant(admin, QA, 'free')
    await setTenantPlan(admin, QA.id, QA.planSlug)
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')

    paidCourseId = await insertCourse(admin, QA.id, 'E2E #929 paid course')
    stripeCourseId = await insertCourse(admin, QA.id, 'E2E #929 card course')
    freeCourseId = await insertCourse(admin, QA.id, 'E2E #929 free course')
    const planCourseId = await insertCourse(admin, QA.id, 'E2E #929 plan course')

    const manualProductId = await insertProduct(admin, 'E2E #929 manual product', OVERDUE_SALE, 'manual', paidCourseId)
    await insertProduct(admin, 'E2E #929 card product', 30, 'stripe', stripeCourseId)
    // A second, never-bought manual product: the student has no renewal exemption on it.
    const openManualCourseId = await insertCourse(admin, QA.id, 'E2E #929 unbought manual course')
    openManualProductId = await insertProduct(admin, 'E2E #929 unbought manual product', 25, 'manual', openManualCourseId)

    heldPlanId = await insertPlan(admin, 'E2E #929 held plan', CURRENT_SALE)
    otherPlanId = await insertPlan(admin, 'E2E #929 other plan', 40)
    const { error: pcError } = await admin
      .from('plan_courses')
      .insert({ plan_id: heldPlanId, course_id: planCourseId })
    if (pcError) throw new Error(`could not link plan course: ${pcError.message}`)

    // A bank-transfer sale 70 days ago (before any due boundary → overdue);
    // the insert trigger enrolls the student through enroll_user().
    const overdue = await insertTxn(admin, {
      product_id: manualProductId,
      amount: OVERDUE_SALE,
      status: 'successful',
      tenant_id: QA.id,
      transaction_date: new Date(Date.now() - 70 * DAY_MS).toISOString(),
    })
    if (overdue.error) throw new Error(`could not seed overdue sale: ${overdue.error.message}`)

    // A plan bought by transfer this month: accrues but is not due yet, and
    // gives the student a live manual subscription (renewal exemption, 4.2a).
    const current = await insertTxn(admin, {
      plan_id: heldPlanId,
      amount: CURRENT_SALE,
      status: 'successful',
      tenant_id: QA.id,
    })
    if (current.error) throw new Error(`could not seed plan sale: ${current.error.message}`)
  })

  test.afterAll(async () => {
    const admin = getAdmin()
    if (originalMode) await setMode(admin, originalMode)

    // Undo whatever the cron wrote for OTHER tenants during this file.
    const { data: after } = await admin.from('tenant_fee_standing').select('tenant_id').neq('tenant_id', QA.id)
    const before = new Map(standingBefore.map((r) => [r.tenant_id, r]))
    for (const r of after ?? []) {
      if (!before.has(r.tenant_id as string)) {
        await admin.from('tenant_fee_standing').delete().eq('tenant_id', r.tenant_id)
      }
    }
    for (const r of standingBefore) {
      await admin.from('tenant_fee_standing').upsert(r, { onConflict: 'tenant_id' })
    }
    const { data: stmts } = await admin.from('platform_fee_statements').select('statement_id').neq('tenant_id', QA.id)
    for (const s of stmts ?? []) {
      if (!statementsBefore.has(s.statement_id as string)) {
        await admin.from('platform_fee_statements').delete().eq('statement_id', s.statement_id)
      }
    }

    // The QA tenant: fee rows first (the fee request → payment FK is RESTRICT),
    // then destroyQaTenant; transactions/products/plans cascade with the tenant.
    await admin.from('platform_fee_audit_log').delete().eq('tenant_id', QA.id)
    await admin.from('platform_payment_requests').delete().eq('tenant_id', QA.id)
    await admin.from('platform_fee_payments').delete().eq('tenant_id', QA.id)
    await admin.from('platform_fee_statements').delete().eq('tenant_id', QA.id)
    await admin.from('tenant_fee_standing').delete().eq('tenant_id', QA.id)
    await admin.from('subscriptions').delete().eq('tenant_id', QA.id)
    await admin.from('transactions').delete().eq('tenant_id', QA.id)
    await destroyQaTenant(admin, QA)
  })

  test('manual sales accrue a balance shown on the earnings balance card', async ({ page }) => {
    test.setTimeout(120_000)
    const admin = getAdmin()

    const { data: ledger, error } = await admin.rpc('platform_fee_ledger', { _tenant_id: QA.id })
    expect(error).toBeNull()
    expect(ledger).toEqual([expect.objectContaining({ currency: 'USD', paid: 0, sales: 2 })])
    expect(Number(ledger![0].accrued)).toBe(EXPECTED_OWED)

    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/earnings`, { waitUntil: 'domcontentloaded' })
    const card = page.getByTestId('fee-balance-card')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.getByTestId('fee-balance-error')).toHaveCount(0)
    await expect(card.locator('[data-testid="fee-owed-lines"] li[data-currency="USD"]')).toContainText('$15.00')
    await expect(card.getByTestId('fee-standing-state')).toHaveText('Up to date')
    await expect(card.getByTestId('fee-pay-now-btn')).toBeVisible()
  })

  test('cron dry run reports the would-act set and writes nothing', async ({ request }) => {
    const admin = getAdmin()
    await setMode(admin, 'enforce')

    const dry = await runFeeCron(request, true)
    expect(dry.success).toBe(true)
    expect(dry.dryRun).toBe(true)
    expect(dry.mode).toBe('enforce')
    expect(dry.actions).toContainEqual(expect.objectContaining({ tenantId: QA.id, action: 'overdue' }))
    expect(await standing(admin, QA.id)).toBeNull()

    // A real run marks the school overdue — but not blocked: grace has not passed.
    const real = await runFeeCron(request)
    expect(real.dryRun).toBe(false)
    const s = await standing(admin, QA.id)
    expect(s).toMatchObject({ state: 'overdue', blocked_at: null })
    expect(s!.overdue_since).not.toBeNull()

    // Past the 7-day grace: the dry run would block, and still writes nothing.
    const backdated = new Date(Date.now() - 8 * DAY_MS).toISOString()
    const { error } = await admin.from('tenant_fee_standing').update({ overdue_since: backdated }).eq('tenant_id', QA.id)
    expect(error).toBeNull()
    const before = await standing(admin, QA.id)
    const { count: stmtsBefore } = await admin
      .from('platform_fee_statements')
      .select('statement_id', { count: 'exact', head: true })

    const dry2 = await runFeeCron(request, true)
    expect(dry2.actions).toContainEqual(expect.objectContaining({ tenantId: QA.id, action: 'block' }))
    expect(await standing(admin, QA.id)).toEqual(before)
    const { count: stmtsAfter } = await admin
      .from('platform_fee_statements')
      .select('statement_id', { count: 'exact', head: true })
    expect(stmtsAfter).toBe(stmtsBefore)
    expect(await isBlocked(admin, QA.id)).toBe(false)
  })

  test('enforce run blocks the overdue school; new sales are refused, renewals and access are not', async ({ page, request }) => {
    test.setTimeout(150_000)
    const admin = getAdmin()

    const run = await runFeeCron(request)
    expect(run.blocked).toBeGreaterThanOrEqual(1)
    const s = await standing(admin, QA.id)
    expect(s?.state).toBe('blocked')
    expect(s?.blocked_at).not.toBeNull()
    expect(await isBlocked(admin, QA.id)).toBe(true)

    // DB backstop: a NEW sale insert raises LM003.
    const refused = await insertTxn(admin, { product_id: null, plan_id: otherPlanId, amount: 40, status: 'pending', tenant_id: QA.id })
    expect(refused.error?.code).toBe('LM003')

    // Renewal of the plan the student already holds still lands (4.2a, B.1).
    const renewal = await insertTxn(admin, { plan_id: heldPlanId, amount: CURRENT_SALE, status: 'pending', tenant_id: QA.id })
    expect(renewal.error).toBeNull()
    await admin.from('transactions').delete().eq('transaction_id', renewal.data!.transaction_id)

    // A new free self-enrollment is refused too (grant_free_entitlement → LM003).
    const student = await studentClient()
    const { error: freeError } = await student.rpc('grant_free_entitlement', {
      _user_id: SEEDED.student.id,
      _course_id: freeCourseId,
    })
    expect(freeError?.code).toBe('LM003')

    // A student who already paid keeps access (D5: the block gates sales only).
    const { data: access, error: accessError } = await admin.rpc('has_course_access', {
      _user_id: SEEDED.student.id,
      _course_id: paidCourseId,
    })
    expect(accessError).toBeNull()
    expect(access).toBe(true)

    // The checkout page shows the neutral notice instead of any payment UI.
    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/checkout?courseId=${stripeCourseId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('checkout-sales-blocked')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('checkout-sales-blocked')).toHaveText(
      "This school isn't accepting new enrollments right now. Please try again later.",
    )
    // Never reveals the school's fee debt to the student.
    await expect(page.getByText(/platform fee|overdue/i)).toHaveCount(0)

    // The bank-transfer request page shows the same notice, not a submit form.
    await page.goto(`${QA_BASE}/${LOCALE}/checkout/manual?productId=${openManualProductId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('checkout-sales-blocked')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /submit request/i })).toHaveCount(0)
    await expect(page.getByText(/platform fee|overdue/i)).toHaveCount(0)
  })

  test('admin requests a bank-transfer pay-now for the full balance', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/earnings`, { waitUntil: 'domcontentloaded' })
    const card = page.getByTestId('fee-balance-card')
    await expect(card.getByTestId('fee-standing-state')).toHaveText('Sales paused', { timeout: 30_000 })

    await card.getByTestId('fee-pay-now-btn').click()
    const dialog = page.getByTestId('fee-pay-now-dialog')
    await expect(dialog).toBeVisible()
    const manualRail = dialog.getByTestId('fee-pay-now-rail-manual')
    if (await manualRail.count()) await manualRail.click()
    await expect(dialog.getByTestId('fee-pay-now-amount')).toHaveValue('15.00')
    await dialog.getByTestId('fee-pay-now-submit').click()
    await expect(dialog.getByTestId('fee-pay-now-instructions')).toBeVisible({ timeout: 30_000 })

    const admin = getAdmin()
    const { data: req } = await admin
      .from('platform_payment_requests')
      .select('request_type, status, amount')
      .eq('tenant_id', QA.id)
      .single()
    expect(req).toMatchObject({ request_type: 'fee', status: 'pending' })
    expect(Number(req!.amount)).toBe(EXPECTED_OWED)
    // An open request does NOT pause the block (design 3.3).
    expect(await isBlocked(admin, QA.id)).toBe(true)
  })

  test('super admin confirms the transfer: balance cleared and sales resume at once', async ({ page, request }) => {
    test.setTimeout(120_000)
    await login(page, SEEDED.owner.email, SEEDED.owner.password, BASE)
    await page.goto(`${BASE}/${LOCALE}/platform/tenants/${QA.id}`, { waitUntil: 'domcontentloaded' })
    const panel = page.getByTestId('tenant-fee-panel')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await panel.getByTestId('fee-confirm-request-btn').click()
    await page.getByTestId('fee-confirm-request-dialog-submit').click()
    await expect(page.getByTestId('fee-confirm-request-dialog')).toBeHidden({ timeout: 30_000 })

    const admin = getAdmin()
    await expect.poll(() => isBlocked(admin, QA.id), { timeout: 15_000 }).toBe(false)
    expect(await standing(admin, QA.id)).toMatchObject({ state: 'ok', blocked_at: null, overdue_since: null })
    const { data: ledger } = await admin.rpc('platform_fee_ledger', { _tenant_id: QA.id })
    expect(Number(ledger![0].accrued) - Number(ledger![0].paid)).toBe(0)

    // New sales work again: the free enroll that was refused now succeeds…
    const student = await studentClient()
    const { error: freeError } = await student.rpc('grant_free_entitlement', {
      _user_id: SEEDED.student.id,
      _course_id: freeCourseId,
    })
    expect(freeError).toBeNull()
    // …and the gate admits the plan sale it refused while blocked.
    const { data: allows } = await admin.rpc('transaction_sales_gate_allows', {
      _tenant_id: QA.id,
      _user_id: SEEDED.student.id,
      _product_id: null,
      _plan_id: otherPlanId,
      _payment_provider: 'manual',
      _provider_subscription_id: null,
    })
    expect(allows).toBe(true)

    // The next cron run does not re-block a paid school.
    await runFeeCron(request)
    expect(await standing(admin, QA.id)).toMatchObject({ state: 'ok', blocked_at: null })
  })

  test('the default tenant is never blocked, however overdue', async ({ request }) => {
    const admin = getAdmin()
    const { data: prior } = await admin.from('tenant_fee_standing').select('*').eq('tenant_id', DEFAULT_TENANT).maybeSingle()

    const seeded = await insertTxn(admin, {
      product_id: null,
      plan_id: null,
      amount: 10,
      status: 'successful',
      tenant_id: DEFAULT_TENANT,
      transaction_date: new Date(Date.now() - 70 * DAY_MS).toISOString(),
    })
    expect(seeded.error).toBeNull()
    try {
      const { error } = await admin.from('tenant_fee_standing').upsert(
        {
          tenant_id: DEFAULT_TENANT,
          state: 'overdue',
          overdue_since: new Date(Date.now() - 30 * DAY_MS).toISOString(),
          blocked_at: null,
          enforcement_exempt: false,
        },
        { onConflict: 'tenant_id' },
      )
      expect(error).toBeNull()

      const dry = await runFeeCron(request, true)
      expect(dry.actions ?? []).not.toContainEqual(expect.objectContaining({ tenantId: DEFAULT_TENANT, action: 'block' }))

      await runFeeCron(request)
      const s = await standing(admin, DEFAULT_TENANT)
      expect(s?.blocked_at).toBeNull()
      expect(s?.state).toBe('overdue')
      expect(await isBlocked(admin, DEFAULT_TENANT)).toBe(false)
    } finally {
      await admin.from('transactions').delete().eq('transaction_id', seeded.data!.transaction_id)
      if (prior) {
        await admin.from('tenant_fee_standing').upsert(prior, { onConflict: 'tenant_id' })
      } else {
        await admin.from('tenant_fee_standing').delete().eq('tenant_id', DEFAULT_TENANT)
      }
    }
  })
})
