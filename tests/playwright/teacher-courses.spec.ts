import { test, expect } from '@playwright/test'
import { loginAsTeacher, loginAsAdmin } from './utils/auth'
import { BASE, TENANT_BASE } from './utils/constants'

/**
 * P1 — Teacher Course Management Tests
 *
 * Covers: dashboard, courses list, course creation, course detail navigation,
 * revenue, certificate templates, full smoke test, and cross-tenant access.
 *
 * Note: teacher account (owner@e2etest.com) has admin role on the default
 * tenant and lands on /dashboard/admin after login. All tests navigate
 * explicitly to /dashboard/teacher.
 *
 * Spec: tests/playwright/specs/teacher-courses.spec.md
 */

test.describe('Teacher Course Management', () => {
  test.describe('Default Tenant', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsTeacher(page)
      // Teacher account lands on /dashboard/admin — navigate explicitly
      await page.goto(`${BASE}/en/dashboard/teacher`)
    })

    // ── 1. Dashboard ──────────────────────────────────────────────────────

    test('teacher dashboard loads with welcome message', async ({ page }) => {
      await expect(page.getByTestId('teacher-dashboard')).toBeVisible()
      await expect(page.getByTestId('teacher-welcome')).toBeVisible()
    })

    // ── 2. Courses List ───────────────────────────────────────────────────

    test('teacher courses list page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/courses`)
      await expect(page.getByTestId('teacher-courses-list')).toBeVisible()
    })

    // ── 3. Course Creation Form ───────────────────────────────────────────

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

    // ── 4. Course Detail Navigation ───────────────────────────────────────

    test('teacher can navigate to course detail/edit page', async ({
      page,
    }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/courses`)
      await expect(page.getByTestId('teacher-courses-list')).toBeVisible()
      // Click the "Edit" link on the first course card
      const editLink = page.locator('a[href*="/teacher/courses/1001"]').first()
      await expect(editLink).toBeVisible({ timeout: 10_000 })
      await editLink.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toMatch(/\/teacher\/courses\/\d+/)
    })

    // ── 5. Revenue Page ───────────────────────────────────────────────────

    test('teacher revenue page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/revenue`)
      await expect(page.getByTestId('revenue-page')).toBeVisible()
    })

    // ── 6. Certificate Templates Page ─────────────────────────────────────

    test('teacher certificate templates page loads', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/teacher/templates`)
      await expect(page.getByTestId('templates-page')).toBeVisible()
    })

    // ── 7. Smoke Test (Full Navigation Flow) ──────────────────────────────

    test('full smoke: dashboard → courses → create → revenue → templates, no console errors', async ({
      page,
    }) => {
      // Collect console errors throughout the flow
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })

      // Dashboard
      await expect(page.getByTestId('teacher-dashboard')).toBeVisible()
      await expect(page.getByTestId('teacher-welcome')).toBeVisible()

      // Courses list
      await page.goto(`${BASE}/en/dashboard/teacher/courses`)
      await expect(page.getByTestId('teacher-courses-list')).toBeVisible()

      // Create course form
      await page.goto(`${BASE}/en/dashboard/teacher/courses/new`)
      await expect(page.getByLabel(/title/i)).toBeVisible()
      await expect(page.getByLabel(/description/i)).toBeVisible()

      // Revenue
      await page.goto(`${BASE}/en/dashboard/teacher/revenue`)
      await expect(page.getByTestId('revenue-page')).toBeVisible()

      // Templates
      await page.goto(`${BASE}/en/dashboard/teacher/templates`)
      await expect(page.getByTestId('templates-page')).toBeVisible()

      // No console errors
      expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([])
    })
  })

  // ── 8. Cross-Tenant: Admin Access ─────────────────────────────────────

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
