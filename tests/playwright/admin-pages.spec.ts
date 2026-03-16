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
