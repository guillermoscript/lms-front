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

  test('getting started checklist follows the course-first funnel', async ({ page }) => {
    const checklist = page.locator('[data-tour="admin-checklist"]')
    const createCourse = checklist.getByRole('link', {
      name: /Create your first course — set a price and publish/,
    })
    const payments = checklist.getByRole('link', { name: /Set up how you get paid/ })
    const branding = checklist.getByRole('link', { name: /Brand your school/ })
    const inviteStudents = checklist.getByRole('link', { name: /Invite your first students/ })
    const schoolDetails = checklist.getByRole('link', { name: /Configure school details/ })

    await expect(checklist.getByText(/^\d\/5$/)).toBeVisible()
    await expect(createCourse).toHaveAttribute('href', '/dashboard/admin/products/new')
    await expect(payments).toHaveAttribute('href', '/dashboard/admin/settings?tab=payment')
    await expect(branding).toHaveAttribute('href', '/dashboard/admin/appearance')
    await expect(inviteStudents).toHaveAttribute('href', '/dashboard/admin/users')
    await expect(schoolDetails).toHaveAttribute('href', '/dashboard/admin/settings')
    await expect(checklist.getByText('Review your billing plan')).toHaveCount(0)

    const stepLabels = await checklist.locator('a').evaluateAll((links) =>
      links.slice(0, 5).map((link) => link.textContent?.trim())
    )
    expect(stepLabels).toEqual([
      expect.stringContaining('Create your first course'),
      expect.stringContaining('Set up how you get paid'),
      expect.stringContaining('Brand your school'),
      expect.stringContaining('Invite your first students'),
      expect.stringContaining('Configure school details'),
    ])

    // Code Academy has school details configured, so this validates that a
    // checked row remains a real navigation link.
    await schoolDetails.click()
    await expect(page).toHaveURL(/\/en\/dashboard\/admin\/settings$/)
  })

  test('getting started checklist copy is localized in Spanish', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/es/dashboard/admin`)
    const checklist = page.locator('[data-tour="admin-checklist"]')

    await expect(checklist.getByRole('link', {
      name: /Crea tu primer curso — define un precio y publícalo/,
    })).toBeVisible()
    await expect(checklist.getByRole('link', { name: /Configura cómo recibir pagos/ })).toBeVisible()
    await expect(checklist.getByRole('link', { name: /Invita a tus primeros estudiantes/ })).toBeVisible()
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
