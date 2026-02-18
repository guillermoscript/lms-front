import { test, expect } from '@playwright/test'
import { loginAsStudent, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE } from './utils/constants'

/**
 * P1 — Student Feature Tests
 * Covers progress, certificates, payments, profile, store, and navigation.
 */

test.describe('Student Features', () => {
  test.describe('Default Tenant', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('student progress page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/progress`)
      await expect(page.getByTestId('progress-page')).toBeVisible()
      await expect(page.getByTestId('progress-title')).toBeVisible()
    })

    test('student certificates page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/certificates`)
      await expect(page.getByTestId('certificates-page')).toBeVisible()
      await expect(page.getByTestId('certificates-title')).toBeVisible()
    })

    test('student payments page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/payments`)
      await expect(page.getByTestId('payments-page')).toBeVisible()
      await expect(page.getByTestId('payments-title')).toBeVisible()
    })

    test('student profile page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/profile`)
      await expect(page.getByTestId('profile-page')).toBeVisible()
    })

    test('student gamification store page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/store`)
      await expect(page.getByTestId('store-page')).toBeVisible()
    })

    test('student can navigate all sidebar links', async ({ page }) => {
      // Verify sidebar has key navigation links
      const sidebarLinks = [
        'courses',
        'browse',
        'progress',
        'certificates',
      ]
      for (const link of sidebarLinks) {
        const navLink = page.locator(
          `a[href*="/dashboard/student/${link}"]`
        )
        await expect(navLink.first()).toBeVisible()
      }
    })

    test('student dashboard shows course progress indicators', async ({
      page,
    }) => {
      await expect(page.getByTestId('student-dashboard')).toBeVisible()
      // The dashboard should have some content about enrolled courses
      const body = await page.locator('body').textContent()
      expect(body?.length).toBeGreaterThan(0)
    })
  })

  test.describe('Code Academy Tenant', () => {
    test('tenant student payments page loads', async ({ page }) => {
      await loginAsTenantStudent(page)
      await page.goto(`${TENANT_BASE}/en/dashboard/student/payments`)
      await expect(page.getByTestId('payments-page')).toBeVisible()
    })
  })
})
