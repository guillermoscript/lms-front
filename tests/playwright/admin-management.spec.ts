import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

/**
 * P1 — Admin Management Tests
 * Covers payment requests, subscriptions, notifications, billing, analytics.
 */

test.describe('Admin Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('admin payment requests page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/payment-requests`, { timeout: 30_000 })
    await expect(page.getByTestId('payment-requests-page')).toBeVisible({ timeout: 15_000 })
  })

  test('admin subscriptions page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/subscriptions`)
    await expect(page.getByTestId('subscriptions-page')).toBeVisible()
  })

  test('admin notifications page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/notifications`)
    await expect(page.getByTestId('notifications-page')).toBeVisible()
  })

  test('admin notification templates page loads', async ({ page }) => {
    await page.goto(
      `${TENANT_BASE}/en/dashboard/admin/notifications/templates`
    )
    await expect(
      page.getByTestId('notification-templates-page')
    ).toBeVisible()
  })

  test('admin billing page shows current plan and usage', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/billing`)
    await expect(page.getByTestId('billing-page')).toBeVisible()
    await expect(page.getByText(/Billing/i).first()).toBeVisible()
  })

  test('admin billing upgrade page shows plan comparison', async ({
    page,
  }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/billing/upgrade`)
    await expect(page.getByTestId('upgrade-page')).toBeVisible()
    await expect(page.getByText(/Upgrade Your Plan/i)).toBeVisible()
  })

  test('admin analytics page loads', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/analytics`)
    await expect(page.getByTestId('analytics-page')).toBeVisible()
  })

  test('admin can access teacher course creation', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/teacher/courses/new`, {
      timeout: 40_000,
    })
    await expect(page.getByLabel(/title/i)).toBeVisible()
  })
})
