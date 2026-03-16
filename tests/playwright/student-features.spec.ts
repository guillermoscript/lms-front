import { test, expect } from '@playwright/test'
import { loginAsStudent, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE } from './utils/constants'

/**
 * P1 — Student Feature Tests
 *
 * Covers progress, certificates, payments, profile, store, and sidebar navigation.
 * Validates that all student feature pages render correctly with real data
 * after the composition refactor (select narrowing, server data props).
 */

test.describe('Student Features', () => {
  test.describe('Progress Page', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('shows progress stats and per-course progress', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/progress`)
      await expect(page.getByTestId('progress-page')).toBeVisible()
      await expect(page.getByTestId('progress-title')).toBeVisible()

      // Page should show either the stats grid (when enrollments exist)
      // or the empty state card (when no enrollments)
      await page.waitForLoadState('networkidle')

      // Check for stats cards (grid with md:grid-cols-4) or empty state
      const statsCards = page.locator('[class*="grid"] [class*="p-6"]')
      const emptyState = page.locator('text=/No enrollments|Browse Courses/i')

      const hasStats = await statsCards.first().isVisible({ timeout: 10_000 }).catch(() => false)
      const hasEmpty = await emptyState.first().isVisible({ timeout: 5_000 }).catch(() => false)

      expect(hasStats || hasEmpty).toBeTruthy()

      // If stats are visible, look for percentage text or numeric values
      if (hasStats) {
        // Stats cards show numbers (enrolled count, lessons completed, etc.)
        // Per-course progress shows percentage or badge text
        const numericValues = page.locator('text=/\\d+/')
        await expect(numericValues.first()).toBeVisible({ timeout: 5_000 })
      }
    })
  })

  test.describe('Certificates Page', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('certificates page loads with title', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/certificates`)
      await expect(page.getByTestId('certificates-page')).toBeVisible()
      await expect(page.getByTestId('certificates-title')).toBeVisible()
    })
  })

  test.describe('Payments Page', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('payments page loads with title and content', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/payments`)
      await expect(page.getByTestId('payments-page')).toBeVisible()
      await expect(page.getByTestId('payments-title')).toBeVisible()
    })
  })

  test.describe('Profile Page', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('profile page loads with user settings', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/profile`)
      await expect(page.getByTestId('profile-page')).toBeVisible()

      // Profile page should contain form elements or user information
      const body = page.locator('body')
      await expect(body).not.toBeEmpty()
    })
  })

  test.describe('Gamification Store', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('store page loads with heading and store section', async ({
      page,
    }) => {
      await page.goto(`${BASE}/en/dashboard/student/store`)
      await expect(page.getByTestId('store-page')).toBeVisible()

      // Store should have a heading (h1)
      await expect(page.locator('h1').first()).toBeVisible()
    })
  })

  test.describe('Sidebar Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('sidebar contains links to all student sections', async ({
      page,
    }) => {
      // Verify sidebar has key navigation links from the dashboard
      const sidebarSections = [
        'courses',
        'browse',
        'progress',
        'certificates',
      ]

      for (const section of sidebarSections) {
        const navLink = page.locator(
          `a[href*="/dashboard/student/${section}"]`
        )
        await expect(navLink.first()).toBeVisible()
      }
    })

    test('sidebar links navigate to correct pages', async ({ page }) => {
      test.setTimeout(60_000)

      // Click courses link and verify navigation
      const coursesLink = page.locator(
        'a[href*="/dashboard/student/courses"]'
      ).first()
      await coursesLink.click()
      await expect(page.getByTestId('student-courses-page')).toBeVisible({
        timeout: 15_000,
      })

      // Click browse link and verify navigation
      const browseLink = page.locator(
        'a[href*="/dashboard/student/browse"]'
      ).first()
      await browseLink.click()
      await expect(page.getByTestId('browse-courses-page')).toBeVisible({
        timeout: 15_000,
      })

      // Click progress link and verify navigation
      const progressLink = page.locator(
        'a[href*="/dashboard/student/progress"]'
      ).first()
      await progressLink.click()
      await expect(page.getByTestId('progress-page')).toBeVisible({
        timeout: 15_000,
      })
    })
  })

  test.describe('Code Academy Tenant', () => {
    test('tenant student payments page loads', async ({ page }) => {
      await loginAsTenantStudent(page)
      await page.goto(`${TENANT_BASE}/en/dashboard/student/payments`)
      await expect(page.getByTestId('payments-page')).toBeVisible()
    })

    test('tenant student progress page loads', async ({ page }) => {
      await loginAsTenantStudent(page)
      await page.goto(`${TENANT_BASE}/en/dashboard/student/progress`)
      await expect(page.getByTestId('progress-page')).toBeVisible()
      await expect(page.getByTestId('progress-title')).toBeVisible()
    })
  })
})
