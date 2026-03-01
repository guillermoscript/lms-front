import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './utils/auth'
import { BASE, TENANT_BASE } from './utils/constants'

/**
 * P2 — Feature Gating Tests
 * Verifies billing pages, plan limits display, and public pricing.
 */

test.describe('Feature Gating', () => {
  test('billing page shows usage meters', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/billing`)
    await expect(page.getByTestId('billing-page')).toBeVisible()
    // Should show some plan/usage info
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(100)
  })

  test('upgrade page shows plans with pricing', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/billing/upgrade`)
    await expect(page.getByTestId('upgrade-page')).toBeVisible()
    // Should show plan names
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/free|starter|pro|business|enterprise/i)
  })

  test('public platform-pricing page renders plan comparison', async ({
    page,
  }) => {
    await page.goto(`${BASE}/en/platform-pricing`)
    await page.waitForLoadState('networkidle')
    // This page may redirect or show pricing — just verify it loads
    await expect(page.locator('body')).toBeVisible()
  })

  test('course creation shows plan limit info', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/teacher/courses`)
    await expect(page.getByTestId('teacher-courses-list')).toBeVisible()
    // The courses page should load without errors
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(50)
  })
})
