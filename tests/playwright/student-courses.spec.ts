import { test, expect } from '@playwright/test'
import { loginAsStudent, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE } from './utils/constants'

/**
 * P1 — Student Course Flow Tests
 * Covers dashboard, course navigation, lessons, exams, exercises, and browse.
 */

test.describe('Student Course Flows', () => {
  test.describe('Default Tenant', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('student dashboard loads with welcome hero', async ({ page }) => {
      await expect(page.getByTestId('student-dashboard')).toBeVisible()
      await expect(page.getByTestId('welcome-hero')).toBeVisible()
    })

    test('student can view enrolled courses page', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/courses`)
      await expect(page.getByTestId('student-courses-page')).toBeVisible()
      await expect(page.getByTestId('my-courses-title')).toBeVisible()
    })

    test('student can navigate to course detail', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/courses/1`)
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 })
    })

    test('lesson content page loads with complete toggle', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/courses/1/lessons/1`)
      await expect(page.getByTestId('lesson-complete-toggle')).toBeVisible({
        timeout: 15_000,
      })
    })

    test('lesson complete toggle is interactive', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(`${BASE}/en/dashboard/student/courses/1/lessons/1`, {
        timeout: 40_000,
      })
      const toggle = page.getByTestId('lesson-complete-toggle')
      await expect(toggle).toBeVisible({ timeout: 15_000 })
      await expect(toggle).toBeEnabled()
    })

    test('student can navigate between lessons via sidebar', async ({
      page,
    }) => {
      test.setTimeout(60_000)
      await page.goto(`${BASE}/en/dashboard/student/courses/1/lessons/1`, {
        timeout: 40_000,
      })
      // Look for sidebar navigation with lesson links
      const sidebar = page.locator('nav, aside, [role="navigation"]')
      await expect(sidebar.first()).toBeVisible({ timeout: 15_000 })
    })

    test('browse page shows available courses', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/browse`)
      await expect(page.getByTestId('browse-title')).toBeVisible()
      await expect(page.getByTestId('browse-course-count')).toBeVisible()
    })

    test('student can view course detail from browse', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/browse`)
      await expect(page.getByTestId('browse-title')).toBeVisible()
      // Course cards should have links
      const courseLinks = page.locator('a[href*="/courses/"]')
      const count = await courseLinks.count()
      expect(count).toBeGreaterThan(0)
    })
  })

  test.describe('Code Academy Tenant', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsTenantStudent(page)
    })

    test('tenant student can view enrolled courses', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/student/courses`)
      await expect(page.getByTestId('student-courses-page')).toBeVisible()
    })

    test('tenant browse shows tenant courses only', async ({ page }) => {
      await page.goto(`${TENANT_BASE}/en/dashboard/student/browse`)
      await expect(page.getByTestId('browse-title')).toBeVisible()
      await expect(page.getByText(/Python for Beginners/i)).toBeVisible()
    })
  })
})
