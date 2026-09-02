/**
 * Tiered plan features, both sides of the line (#296 Phase 5, case 4).
 *
 * plan-feature-gates.spec.ts pins Free (everything locked) and Enterprise
 * (everything open) on the seeded tenants. This spec moves ONE dedicated
 * tenant between plans to pin the tiers in between:
 *
 *   remove_branding  Free shows "Powered by" on the public site; Pro hides it
 *   analytics        Starter is `basic` — page renders, export is withheld and
 *                    the compact nudge says why; Pro is `advanced` — export back,
 *                    nudge gone
 *
 * Both gates are server-side (lib/plans/server.ts), so a plan change is
 * visible on the next request with no client state to reset.
 */
import { test, expect } from '@playwright/test'
import { login } from './utils/auth'
import { LOCALE } from './utils/constants'
import {
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  setTenantPlan,
  tenantBase,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000299',
  slug: 'qa-feature-tiers',
  name: 'QA Feature Tiers',
  planSlug: 'e2e-unused-tiers',
}
const QA_BASE = tenantBase(QA.slug)

const analyticsNudge = '[data-testid="upgrade-nudge"][data-feature="analytics"]'

test.describe.configure({ mode: 'serial' })

test.describe('plan feature tiers (#296)', () => {
  test.beforeAll(async () => {
    const admin = getAdmin()
    await destroyQaTenant(admin, QA)
    await createQaTenant(admin, QA, 'free')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
  })

  test.afterAll(async () => {
    await destroyQaTenant(getAdmin(), QA)
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test('"Powered by" stays on a Free school and leaves on Pro', async ({ page }) => {
    const admin = getAdmin()
    await setTenantPlan(admin, QA.id, 'free')
    await page.goto(`${QA_BASE}/${LOCALE}`)
    await expect(page.getByText('Powered by', { exact: false }).first()).toBeVisible({ timeout: 20_000 })

    await setTenantPlan(admin, QA.id, 'pro')
    await page.goto(`${QA_BASE}/${LOCALE}`)
    await expect(page.getByText('Powered by', { exact: false })).toHaveCount(0)
  })

  test('Starter analytics is basic: no export, a nudge that says so', async ({ page }) => {
    test.setTimeout(120_000)
    await setTenantPlan(getAdmin(), QA.id, 'starter')
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/analytics`)

    await expect(page.getByTestId('analytics-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator(analyticsNudge)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0)
  })

  test('Pro analytics is advanced: export is back, the nudge is gone', async ({ page }) => {
    test.setTimeout(120_000)
    await setTenantPlan(getAdmin(), QA.id, 'pro')
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/analytics`)

    await expect(page.getByTestId('analytics-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
    await expect(page.locator(analyticsNudge)).toHaveCount(0)
  })

  test('Free analytics is locked outright', async ({ page }) => {
    test.setTimeout(120_000)
    await setTenantPlan(getAdmin(), QA.id, 'free')
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/analytics`)

    await expect(page.locator(analyticsNudge)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('analytics-page')).toHaveCount(0)
  })
})
