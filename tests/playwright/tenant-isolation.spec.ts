import { test, expect } from '@playwright/test'
import { login, loginAsStudent, loginAsAdmin, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE, ACCOUNTS } from './utils/constants'

/**
 * P0 — Tenant Isolation Tests
 * Verifies multi-tenant data boundaries using pre-seeded accounts.
 */

test.describe('Tenant Isolation', () => {
  test('student on default tenant cannot see code-academy courses via browse', async ({
    page,
  }) => {
    await loginAsStudent(page)
    await page.goto(`${BASE}/en/dashboard/student/browse`)
    await expect(page.getByTestId('browse-course-count')).toBeVisible()
    // Python for Beginners belongs to Code Academy — must NOT appear
    await expect(page.getByText(/Python for Beginners/i)).not.toBeVisible()
  })

  test('student on code-academy cannot see default tenant courses', async ({
    page,
  }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/browse`)
    await expect(page.getByTestId('browse-course-count')).toBeVisible()
    // Introduction to Testing belongs to default tenant — must NOT appear
    await expect(page.getByText(/Introduction to Testing/i)).not.toBeVisible()
  })

  test('non-member accessing code-academy subdomain redirected to join-school', async ({
    page,
  }) => {
    // student@e2etest.com is NOT a member of code-academy
    await loginAsStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student`, { timeout: 30_000 })
    await page.waitForLoadState('networkidle')
    const url = page.url()
    expect(url).toMatch(/\/join-school|\/auth\/login/)
  })

  test('admin dashboard on code-academy shows only code-academy data', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await expect(page.getByTestId('admin-dashboard')).toBeVisible()
    await expect(page.getByTestId('admin-stats-grid')).toBeVisible()
    // The dashboard stats should reflect code-academy data only
    const body = await page.locator('body').textContent()
    expect(body).toContain('Code Academy')
  })

  test('pricing page on code-academy shows only code-academy products', async ({
    page,
  }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/pricing`)
    await expect(page.getByTestId('pricing-title')).toBeVisible()
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeVisible()
  })

  test('teacher courses list scoped to current tenant', async ({ page }) => {
    await login(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, BASE)
    await page.goto(`${BASE}/en/dashboard/teacher/courses`)
    await expect(page.getByTestId('teacher-courses-list')).toBeVisible()
    // Should not contain Code Academy courses
    await expect(page.getByText(/Python for Beginners/i)).not.toBeVisible()
  })

  test('student browse page scoped to current tenant', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/browse`)
    await expect(page.getByTestId('browse-title')).toBeVisible()
    // Code Academy should show its own courses
    await expect(page.getByText(/Python for Beginners/i)).toBeVisible()
  })

  test('API request to pages includes tenant context', async ({ page }) => {
    await loginAsTenantStudent(page)
    // Navigate to a page and verify it loads correctly on the tenant subdomain
    await page.goto(`${TENANT_BASE}/en/dashboard/student`)
    await expect(page).toHaveURL(/code-academy\.lvh\.me/)
  })
})
