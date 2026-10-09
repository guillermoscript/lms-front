/**
 * Admin earnings page (#928): who can open it and how it is reached.
 *
 *   1. A Code Academy admin opens /dashboard/admin/earnings: the page renders
 *      the "Owed to the platform" card, the scope note naming the covered
 *      rails, and the sales table — never the access-denied card.
 *   2. It is linked from the Monetization overview, and the "Open payment
 *      requests" card links to the payment-requests page's Open tab, whose
 *      count is the same number (pending + contacted).
 *   3. A throwaway teacher of the same school is bounced by proxy.ts
 *      (`/dashboard/admin/*` requires the admin role) to /dashboard/teacher.
 *   4. A student is bounced to /dashboard/student.
 *
 * The teacher is created in `beforeAll` and removed in `afterAll`; seeded data
 * is never touched. Run with `--workers=1` on lvh.me (see tests/README.md).
 */
import { test, expect } from './utils/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { login, loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { getServiceRoleClient, CODE_ACADEMY_TENANT } from './utils/seed-state'

test.describe.configure({ mode: 'serial' })

const PASSWORD = 'password123'
const RUN_ID = Date.now().toString(36)
const TEACHER = `qa-928-teacher-${RUN_ID}@e2etest.com`
const EARNINGS = `${TENANT_BASE}/${LOCALE}/dashboard/admin/earnings`

let admin: SupabaseClient
let teacherId: string | null = null

test.beforeAll(async () => {
  admin = getServiceRoleClient()
  const { data, error } = await admin.auth.admin.createUser({ email: TEACHER, password: PASSWORD, email_confirm: true })
  expect(error, `create teacher ${TEACHER}`).toBeNull()
  teacherId = data!.user!.id
  const { error: memberError } = await admin
    .from('tenant_users')
    .insert({ tenant_id: CODE_ACADEMY_TENANT, user_id: teacherId, role: 'teacher', status: 'active' })
  expect(memberError, 'add teacher to Code Academy').toBeNull()
})

test.afterAll(async () => {
  if (!teacherId) return
  await admin.from('tenant_users').delete().eq('user_id', teacherId)
  await admin.auth.admin.deleteUser(teacherId)
})

test('admin sees the earnings page with the debt card and scope note', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsAdmin(page)
  await page.goto(EARNINGS, { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('earnings-page')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('earnings-denied')).toHaveCount(0)
  await expect(page.getByText('Owed to the platform')).toBeVisible()
  await expect(page.getByTestId('earnings-owed-to-platform')).toBeVisible()

  const scope = page.getByTestId('earnings-scope')
  await expect(scope).toContainText('Manual / bank transfer')
  await expect(scope).toContainText('PayPal')
  await expect(scope).toContainText('Stripe and Solana sales are not listed')
  await expect(scope).toContainText('UTC')

  // Filters round-trip through the URL; an unknown status falls back to All.
  await page.goto(`${EARNINGS}?status=counted&collector=school`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: 'Counted in balances' })).toHaveAttribute('aria-current', 'true')
  for (const r of await page.getByTestId('earnings-row').all()) {
    await expect(r).toHaveAttribute('data-collector', 'school')
  }
})

test('earnings is linked from Monetization, and the open-requests card matches the Open tab', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsAdmin(page)

  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/monetization`, { waitUntil: 'domcontentloaded' })
  const navLink = page.locator('a[href$="/dashboard/admin/earnings"]').first()
  await expect(navLink).toBeAttached({ timeout: 30_000 })
  await navLink.click()
  await expect(page).toHaveURL(/\/dashboard\/admin\/earnings/, { timeout: 30_000 })

  const openCount = Number((await page.getByTestId('earnings-open-requests').textContent())?.trim())
  expect(Number.isFinite(openCount)).toBe(true)

  await page.getByTestId('earnings-open-requests-link').click()
  await expect(page).toHaveURL(/\/dashboard\/admin\/payment-requests\?tab=open/, { timeout: 30_000 })
  await expect(page.getByRole('tab', { name: `Open (${openCount})` })).toHaveAttribute('aria-selected', 'true')
})

test('a teacher is redirected away by proxy.ts', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, TEACHER, PASSWORD, TENANT_BASE)
  await page.goto(EARNINGS, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/dashboard\/teacher/, { timeout: 30_000 })
  await expect(page.getByTestId('earnings-page')).toHaveCount(0)
})

test('a student is redirected away by proxy.ts', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAsTenantStudent(page)
  await page.goto(EARNINGS, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/dashboard\/student/, { timeout: 30_000 })
  await expect(page.getByTestId('earnings-page')).toHaveCount(0)
})
