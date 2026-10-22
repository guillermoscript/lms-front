/**
 * Billing mode UI + comped-expiry cron (#983).
 *
 *  1. Super admin converts a free school to comped from /platform/tenants.
 *  2. A non-super-admin cannot reach /platform/tenants.
 *  3. The school admin sees the comped card (then the internal note after the
 *     super admin switches the school to internal).
 *  4. GET /api/cron/comped-expiry: auth, notice windows + idempotency, dry run,
 *     expiry flip + grace.
 *
 * Own throwaway tenant (+ admin user), created through the service role and
 * deleted afterwards. Seeded tenants are never touched.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from './utils/test'
import { BASE, LOCALE } from './utils/constants'
import { login, loginAsSuperAdmin } from './utils/auth'
import { DAY_MS, SEEDED, addMember, createQaTenant, destroyQaTenant, getAdmin, tenantBase, type QaTenant } from './utils/plan-gate-fixtures'

const T: QaTenant = {
  id: '00000000-0000-0000-0000-000000000985',
  slug: 'qa-billing-mode-ui',
  name: 'QA Billing Mode UI',
  planSlug: 'e2e-tiny-bm-ui', // unused (no hidden plan needed), kept for destroyQaTenant
}
const ADMIN_EMAIL = 'qa-billing-mode-ui-admin@e2etest.com'
const ADMIN_PASSWORD = 'password123'
const REASON = 'E2E #983 comped via dialog'

test.describe.configure({ mode: 'serial' })

let adminUserId = ''

async function tenant(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('tenants')
    .select('billing_mode, plan, billing_status, fee_percent_override, comped_until, comped_notice_sent')
    .eq('id', T.id)
    .single()
  if (error) throw error
  return data
}

async function cleanup(admin: SupabaseClient) {
  await admin.from('notifications').delete().eq('tenant_id', T.id)
  await admin.from('tenant_billing_mode_log').delete().eq('tenant_id', T.id)
  await destroyQaTenant(admin, T)
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const u = list?.users.find((x) => x.email === ADMIN_EMAIL)
  if (u) await admin.auth.admin.deleteUser(u.id)
}

async function runCron(request: import('@playwright/test').APIRequestContext, query = '') {
  const res = await request.get(`${BASE}/api/cron/comped-expiry${query}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    timeout: 90_000,
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as { dryRun: boolean; expired: number; graceStarted: number; errors: number; notices: Record<string, number> }
}

async function noticeCount(admin: SupabaseClient, kind: string) {
  const { data, error } = await admin
    .from('notifications')
    .select('id')
    .eq('tenant_id', T.id)
    .eq('metadata->>kind', kind)
  if (error) throw error
  return data!.length
}

async function openDialogFor(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/${LOCALE}/platform/tenants?q=${encodeURIComponent(T.name)}`, { waitUntil: 'domcontentloaded' })
  const row = page.locator(`[data-testid="tenant-row"][data-tenant-id="${T.id}"]`)
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.getByRole('button').last().evaluate((el) => (el as HTMLElement).click())
  await page.getByTestId('tenant-billing-mode-action').click()
  await expect(page.getByTestId('billing-mode-dialog')).toBeVisible()
  return row
}

async function pickMode(page: import('@playwright/test').Page, mode: 'comped' | 'internal' | 'paid') {
  await page.getByTestId('billing-mode-select').click()
  await page.getByRole('option', { name: mode, exact: true }).click()
}

test.describe('billing mode UI + comped expiry (#983)', () => {
  test.skip(!process.env.CRON_SECRET, 'CRON_SECRET is required to call the cron')

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test.beforeAll(async () => {
    const admin = getAdmin()
    await cleanup(admin)
    await createQaTenant(admin, T, 'free')
    const { data, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`could not create admin user: ${error.message}`)
    adminUserId = data.user.id
    await addMember(admin, T.id, adminUserId, 'admin')
  })

  test.afterAll(async () => {
    await cleanup(getAdmin())
  })

  test('1. super admin converts a free school to comped from the tenants list', async ({ page }) => {
    const admin = getAdmin()
    await loginAsSuperAdmin(page)
    const row = await openDialogFor(page)

    await pickMode(page, 'comped')
    // Plan defaults to enterprise for a free school; select it explicitly anyway.
    await page.getByTestId('billing-mode-plan').click()
    await page.getByRole('option', { name: 'enterprise', exact: true }).click()
    const until = new Date(Date.now() + 20 * DAY_MS).toISOString().slice(0, 10)
    await page.getByTestId('billing-mode-until').fill(until)
    await page.getByTestId('billing-mode-fee').fill('5')
    await page.getByTestId('billing-mode-reason').fill(REASON)
    await page.getByTestId('billing-mode-submit').evaluate((el) => (el as HTMLElement).click())

    await expect(page.getByTestId('billing-mode-dialog')).toBeHidden({ timeout: 30_000 })
    await expect(row.getByTestId('tenant-billing-mode')).toHaveAttribute('data-mode', 'comped', { timeout: 30_000 })
    await expect(row.getByTestId('tenant-billing-mode')).toContainText(/comped/i)

    const t = await tenant(admin)
    expect(t.billing_mode).toBe('comped')
    expect(t.plan).toBe('enterprise')
    expect(Number(t.fee_percent_override)).toBe(5)
    const days = (new Date(t.comped_until!).getTime() - Date.now()) / DAY_MS
    expect(days).toBeGreaterThan(18.5)
    expect(days).toBeLessThan(21.5)

    const { data: log } = await admin.from('tenant_billing_mode_log').select('*').eq('tenant_id', T.id)
    expect(log).toHaveLength(1)
    expect(log![0]).toMatchObject({ old_mode: 'paid', new_mode: 'comped', reason: REASON })
    expect(Number(log![0].fee_percent_override)).toBe(5)

    // Mode filter finds it.
    await page.goto(`${BASE}/${LOCALE}/platform/tenants?mode=comped&q=${encodeURIComponent(T.name)}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator(`[data-testid="tenant-row"][data-tenant-id="${T.id}"]`)).toBeVisible()
    await page.goto(`${BASE}/${LOCALE}/platform/tenants?mode=internal&q=${encodeURIComponent(T.name)}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator(`[data-testid="tenant-row"][data-tenant-id="${T.id}"]`)).toHaveCount(0)

    // History on the detail page.
    await page.goto(`${BASE}/${LOCALE}/platform/tenants/${T.id}`, { waitUntil: 'domcontentloaded' })
    const history = page.getByTestId('billing-mode-history')
    await expect(history).toBeVisible()
    await expect(history.getByTestId('billing-mode-history-row')).toHaveCount(1)
    await expect(history).toContainText('paid → comped')
    await expect(history).toContainText('5%')
    await expect(history).toContainText(REASON)
  })

  test('2. a non super admin cannot open the platform tenants list', async ({ page }) => {
    await login(page, SEEDED.student.email, SEEDED.student.password)
    await page.goto(`${BASE}/${LOCALE}/platform/tenants`, { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/platform/)
    await expect(page.getByTestId('platform-tenants-page')).toHaveCount(0)
  })

  test('3. school admin sees the comped card, then the internal note', async ({ browser }) => {
    const admin = getAdmin()
    const base = tenantBase(T.slug)

    const adminCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()
    await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD, base)
    await adminPage.goto(`${base}/${LOCALE}/dashboard/admin/billing`, { waitUntil: 'domcontentloaded' })
    const card = adminPage.getByTestId('comped-plan-card')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card).toContainText(/enterprise/i)
    await expect(card).toContainText(/5\s*%/)
    const untilYear = String(new Date(Date.now() + 20 * DAY_MS).getFullYear())
    await expect(card).toContainText(untilYear)
    await expect(card.locator('a[href$="/dashboard/admin/billing/upgrade"]')).toHaveCount(1)
    await expect(adminPage.getByTestId('internal-plan-note')).toHaveCount(0)

    // Super admin switches the school to internal through the dialog.
    const saCtx = await browser.newContext()
    const saPage = await saCtx.newPage()
    await loginAsSuperAdmin(saPage)
    await openDialogFor(saPage)
    await pickMode(saPage, 'internal')
    await saPage.getByTestId('billing-mode-reason').fill('E2E #983 internal')
    await saPage.getByTestId('billing-mode-submit').evaluate((el) => (el as HTMLElement).click())
    await expect(saPage.getByTestId('billing-mode-dialog')).toBeHidden({ timeout: 30_000 })
    await expect
      .poll(async () => (await tenant(admin)).billing_mode, { timeout: 30_000 })
      .toBe('internal')
    await saCtx.close()

    await adminPage.goto(`${base}/${LOCALE}/dashboard/admin/billing`, { waitUntil: 'domcontentloaded' })
    await expect(adminPage.getByTestId('internal-plan-note')).toBeVisible({ timeout: 30_000 })
    await expect(adminPage.getByTestId('comped-plan-card')).toHaveCount(0)
    await expect(adminPage.locator('a[href$="/dashboard/admin/billing/upgrade"]')).toHaveCount(0)
    await adminCtx.close()
  })

  test('4a. cron rejects a missing or wrong secret', async ({ request }) => {
    expect((await request.get(`${BASE}/api/cron/comped-expiry`)).status()).toBe(401)
    expect(
      (await request.get(`${BASE}/api/cron/comped-expiry`, { headers: { Authorization: 'Bearer nope' } })).status(),
    ).toBe(401)
  })

  test('4b. one notice per window, idempotent; dry run mutates nothing', async ({ request }) => {
    const admin = getAdmin()
    const { error } = await admin
      .from('tenants')
      .update({
        billing_mode: 'comped',
        plan: 'enterprise',
        comped_until: new Date(Date.now() + 10 * DAY_MS).toISOString(),
        comped_notice_sent: {},
      })
      .eq('id', T.id)
    expect(error).toBeNull()
    const before = await noticeCount(admin, 'comped_expiry')

    // Dry run first: reports, writes nothing.
    const dry = await runCron(request, '?dryRun=1')
    expect(dry.dryRun).toBe(true)
    expect((await tenant(admin)).comped_notice_sent).toEqual({})
    expect(await noticeCount(admin, 'comped_expiry')).toBe(before)

    // 10 days left: 30 and 14 reached; only the smallest (14) is sent, 30 is covered.
    const first = await runCron(request)
    expect(first.errors).toBe(0)
    const sent = (await tenant(admin)).comped_notice_sent as Record<string, string>
    expect(Object.keys(sent).sort()).toEqual(['14', '30'])
    expect(await noticeCount(admin, 'comped_expiry')).toBe(before + 1)

    // Second run: same map, no extra notification.
    await runCron(request)
    expect((await tenant(admin)).comped_notice_sent).toEqual(sent)
    expect(await noticeCount(admin, 'comped_expiry')).toBe(before + 1)
  })

  test('4c. expired comp flips to paid and starts the 7-day grace; dry run first changes nothing', async ({ request }) => {
    const admin = getAdmin()
    const { error } = await admin
      .from('tenants')
      .update({ comped_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
      .eq('id', T.id)
    expect(error).toBeNull()

    const dry = await runCron(request, '?dryRun=1')
    expect(dry.dryRun).toBe(true)
    expect((await tenant(admin)).billing_mode).toBe('comped')

    const run = await runCron(request)
    expect(run.errors).toBe(0)
    expect(run.expired).toBeGreaterThanOrEqual(1)

    const t = await tenant(admin)
    expect(t.billing_mode).toBe('paid')
    expect(t.comped_until).toBeNull()
    expect(t.fee_percent_override).toBeNull()
    expect(t.billing_status).toBe('past_due')

    const { data: sub, error: subError } = await admin
      .from('platform_subscriptions')
      .select('status, grace_period_end')
      .eq('tenant_id', T.id)
      .single()
    expect(subError).toBeNull()
    expect(sub!.status).toBe('past_due')
    const graceDays = (new Date(sub!.grace_period_end).getTime() - Date.now()) / DAY_MS
    expect(graceDays).toBeGreaterThan(6.9)
    expect(graceDays).toBeLessThan(7.1)
    expect(await noticeCount(admin, 'comped_expired')).toBe(1)

    // Re-run is a no-op.
    await runCron(request)
    expect(await noticeCount(admin, 'comped_expired')).toBe(1)
  })
})
