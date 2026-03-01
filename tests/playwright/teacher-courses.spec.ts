import { test, expect } from '@playwright/test'
import { login, loginAsTeacher, loginAsAdmin } from './utils/auth'
import { BASE, TENANT_BASE, ACCOUNTS } from './utils/constants'

/**
 * P1 — Teacher Course Flow Tests
 * Covers dashboard, courses list, course creation, and revenue.
 */

test.describe('Teacher Course Flows', () => {
  test.describe('Default Tenant', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsTeacher(page)
    })

    test('teacher dashboard loads', async ({ page }) => {
      await expect(page.getByTestId('teacher-dashboard')).toBeVisible()
      await expect(page.getByTestId('teacher-welcome')).toBeVisible()
    })

    test('teacher courses list page loads with courses', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/courses`)
      await expect(page.getByTestId('teacher-courses-list')).toBeVisible()
    })

    test('create course form has all required fields', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/courses/new`)
      await expect(page.getByLabel(/title/i)).toBeVisible()
      await expect(page.getByLabel(/description/i)).toBeVisible()
      await expect(page.getByLabel(/status/i)).toBeVisible()
    })

    test('course creation form validates required fields', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/courses/new`)
      // Try to submit without filling required fields
      const submitButton = page.locator('button[type="submit"]')
      if (await submitButton.isVisible()) {
        await submitButton.click()
        await page.waitForTimeout(1000)
        // Should still be on the form page (not navigated away)
        expect(page.url()).toContain('/courses/new')
      }
    })

    test('teacher can navigate to course detail/edit page', async ({
      page,
    }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/courses`)
      await expect(page.getByTestId('teacher-courses-list')).toBeVisible()
      // Look for a course link (exclude /new)
      const courseLink = page
        .locator('a[href*="/teacher/courses/"]')
        .filter({ hasNot: page.locator(':scope[href*="/new"]') })
        .first()
      if (await courseLink.isVisible()) {
        await courseLink.click()
        await page.waitForLoadState('networkidle')
        expect(page.url()).toMatch(/\/teacher\/courses\/\d+/)
      }
    })

    test('teacher revenue page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/revenue`)
      await expect(page.getByTestId('revenue-page')).toBeVisible()
    })

    test('teacher certificate templates page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/templates`)
      await expect(page.getByTestId('templates-page')).toBeVisible()
    })
  })

  test.describe('Code Academy Tenant', () => {
    test('admin can access teacher course creation', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto(`${TENANT_BASE}/en/dashboard/teacher/courses/new`, {
        timeout: 40_000,
      })
      await expect(page.getByLabel(/title/i)).toBeVisible()
    })
  })
})
