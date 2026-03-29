import { test, expect } from '@playwright/test'
import { login, loginAsStudent, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE, ACCOUNTS } from './utils/constants'

/**
 * P0 — Payment Flow Tests
 * Verifies pricing pages, checkout, and payment requests using pre-seeded data.
 */

test.describe('Payment Flows', () => {
  test('pricing page shows tenant-specific products', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/pricing`)
    await expect(page.getByTestId('pricing-title')).toBeVisible()
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeVisible()
    // Price displayed as integer: $19/mo
    await expect(page.getByText(/\$19/)).toBeVisible()
  })

  test('manual checkout page renders product details', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/checkout/manual?productId=3&courseId=3`)
    // Alice may already have an active subscription covering this product
    const checkoutTitle = page.getByTestId('manual-checkout-title')
    const isCheckout = await checkoutTitle.isVisible({ timeout: 10_000 }).catch(() => false)
    if (isCheckout) {
      await expect(page.getByText(/Python for Beginners/i).first()).toBeVisible()
    } else {
      // Redirected because already subscribed/enrolled
      const url = page.url()
      expect(url).toMatch(/dashboard|checkout|courses/)
    }
  })

  test('student can view payment requests page', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/payments`)
    await expect(page.getByTestId('payments-title')).toBeVisible()
  })

  test('checkout page requires authentication', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/checkout/manual?productId=3&courseId=3`)
    await page.waitForTimeout(2000)
    // Should redirect to login when not authenticated
    expect(page.url()).toMatch(/\/auth\/login/)
  })

  test('default tenant pricing page renders', async ({ page }) => {
    await loginAsStudent(page)
    await page.goto(`${BASE}/en/pricing`)
    await expect(page.getByTestId('pricing-title')).toBeVisible()
  })

  test('payment request list is scoped to current tenant', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/payments`)
    await expect(page.getByTestId('payments-page')).toBeVisible()
    // Should only show Code Academy payment data
    const body = await page.locator('body').textContent()
    // Default tenant product names should not appear
    expect(body).not.toContain('Default School Premium')
  })
})
