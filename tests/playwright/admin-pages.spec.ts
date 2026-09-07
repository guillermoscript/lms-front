import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

/**
 * P1 — Admin Pages Tests
 * Verifies all admin dashboard pages load correctly on code-academy tenant.
 */

test.describe('Admin Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('admin dashboard loads with stats grid', async ({ page }) => {
    await expect(page.getByTestId('admin-dashboard')).toBeVisible()
    await expect(page.getByTestId('admin-stats-grid')).toBeVisible()
  })

  /**
   * Since #453 the checklist shows ONE call to action (the next incomplete
   * step, a base-ui Button rendered over a Link, so it is not role=link),
   * the completed steps as struck-through links, and the remaining ones inside
   * a collapsed <details>. Expand it before looking for every step.
   */
  async function expandChecklist(page: import('@playwright/test').Page) {
    const checklist = page.locator('[data-tour="admin-checklist"]')
    await expect(checklist.getByText(/^\d\/5$/)).toBeVisible({ timeout: 15_000 })
    const more = checklist.locator('details:not([open]) > summary')
    if (await more.count()) await more.click()
    return checklist
  }

  test('getting started checklist follows the course-first funnel', async ({ page }) => {
    const checklist = await expandChecklist(page)

    // Every step is reachable and points where the funnel says (#451/#665/#675):
    // course first, then the first student, then getting paid / brand / details.
    // The course step's link follows the school's state (quick create, the
    // first course's lesson editor, or the course itself), so it is a pattern.
    const steps: Array<[RegExp, RegExp]> = [
      [/Create your first course/, /^\/dashboard\/(admin\/courses\/new|teacher\/courses\/\d+)/],
      [/Invite your first student/, /^\/dashboard\/admin\/users$/],
      [/Set up how you get paid/, /^\/dashboard\/admin\/settings\?tab=payment$/],
      [/Brand your school/, /^\/dashboard\/admin\/appearance$/],
      [/Configure school details/, /^\/dashboard\/admin\/settings$/],
    ]
    const hrefs: string[] = []
    for (const [label, href] of steps) {
      const link = checklist.locator('a[href]').filter({ hasText: label }).first()
      await expect(link, `step "${label}"`).toBeAttached()
      const actual = (await link.getAttribute('href')) ?? ''
      expect(actual, `step "${label}" → ${actual}`).toMatch(href)
      hrefs.push(actual)
    }
    await expect(checklist.getByText('Review your billing plan')).toHaveCount(0)

    // The single CTA is the first incomplete step, and it links somewhere in the funnel.
    const next = checklist.getByTestId('onboarding-next-step')
    await expect(next).toBeVisible()
    const nextHref = await next.locator('a').first().getAttribute('href')
    expect(hrefs).toContain(nextHref)

    // Code Academy has school details configured, so this validates that a
    // checked row remains a real navigation link.
    await checklist.locator('a[href="/dashboard/admin/settings"]').first().click()
    await expect(page).toHaveURL(/\/en\/dashboard\/admin\/settings$/)
  })

  test('getting started checklist copy is localized in Spanish', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/es/dashboard/admin`)
    const checklist = await expandChecklist(page)

    for (const label of [
      /Crea tu primer curso/,
      /Configura cómo recibir pagos/,
      /Invita a tu primer estudiante/,
    ]) {
      await expect(checklist.locator('a').filter({ hasText: label }).first()).toBeAttached()
    }
  })

  test('admin users page loads with user list', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/users`)
    await expect(page.getByTestId('users-page')).toBeVisible()
  })

  test('admin can view individual user detail', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/users`)
    await expect(page.getByTestId('users-page')).toBeVisible({ timeout: 15_000 })
    // Look for a user link in the table
    const userLink = page.locator('a[href*="/admin/users/"]').first()
    if (await userLink.isVisible({ timeout: 10_000 })) {
      await userLink.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toMatch(/\/admin\/users\//)
    }
  })

  test('admin courses page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/courses`)
    await expect(page.getByTestId('admin-courses-page')).toBeVisible()
    // Admins create courses through the teacher editor — the page must expose
    // that entry point or admins cannot find it (#665, Sentry LMS-FRONT-9N).
    const createCta = page.getByTestId('admin-create-course')
    await expect(createCta).toBeVisible()
    await expect(createCta).toHaveAttribute('href', /\/dashboard\/admin\/courses\/new$/)
  })

  test('admin enrollments page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/enrollments`)
    await expect(page.getByTestId('enrollments-page')).toBeVisible()
  })

  test('admin transactions page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/transactions`)
    await expect(page.getByTestId('transactions-page')).toBeVisible()
  })

  test('admin products page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/products`)
    await expect(page.getByTestId('products-page')).toBeVisible()
  })

  test('admin plans page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/plans`)
    await expect(page.getByTestId('plans-page')).toBeVisible()
  })

  test('admin categories page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/categories`)
    await expect(page.getByTestId('categories-page')).toBeVisible()
  })

  test('admin settings page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/settings`)
    await expect(page.getByTestId('settings-page')).toBeVisible()
  })
})
