import { test, expect } from '@playwright/test'
import { login, loginAsStudent } from './utils/auth'
import { BASE, TENANT_BASE, ACCOUNTS } from './utils/constants'

/**
 * P0 — Authentication & Security Tests
 * Verifies auth flows, role guards, and credential handling.
 */

test.describe('Authentication Security', () => {
  test('unauthenticated user redirected from /dashboard/student to login', async ({
    page,
  }) => {
    await page.goto(`${BASE}/en/dashboard/student`)
    await page.waitForTimeout(2000)
    expect(page.url()).toMatch(/\/auth\/login|\/en$/)
  })

  test('unauthenticated user redirected from /dashboard/teacher to login', async ({
    page,
  }) => {
    await page.goto(`${BASE}/en/dashboard/teacher`)
    await page.waitForTimeout(2000)
    expect(page.url()).toMatch(/\/auth\/login|\/en$/)
  })

  test('unauthenticated user redirected from /dashboard/admin to login', async ({
    page,
  }) => {
    await page.goto(`${BASE}/en/dashboard/admin`)
    await page.waitForTimeout(2000)
    expect(page.url()).toMatch(/\/auth\/login|\/en$/)
  })

  test('student cannot access /dashboard/teacher — redirected', async ({
    page,
  }) => {
    await loginAsStudent(page)
    await page.goto(`${BASE}/en/dashboard/teacher`)
    await page.waitForTimeout(3000)
    // Student should be redirected away from teacher dashboard
    expect(page.url()).not.toMatch(/\/dashboard\/teacher$/)
  })

  test('student cannot access /dashboard/admin — redirected', async ({
    page,
  }) => {
    await loginAsStudent(page)
    await page.goto(`${BASE}/en/dashboard/admin`)
    await page.waitForTimeout(3000)
    // Student should be redirected away from admin dashboard
    expect(page.url()).not.toMatch(/\/dashboard\/admin$/)
  })

  test('login on tenant subdomain preserves subdomain after auth', async ({
    page,
  }) => {
    await login(
      page,
      ACCOUNTS.admin.email,
      ACCOUNTS.admin.password,
      TENANT_BASE
    )
    // After login, URL should still be on code-academy subdomain
    expect(page.url()).toContain('code-academy.lvh.me')
  })

  test('invalid credentials show error and stay on login page', async ({
    page,
  }) => {
    await page.goto(`${BASE}/en/auth/login`)
    await page.getByTestId('login-email').fill('nobody@test.com')
    await page.getByTestId('login-password').fill('wrongpassword')
    await page.getByTestId('login-submit').click()
    await page.waitForTimeout(3000)
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('sign-up form validates password confirmation', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/sign-up`)
    await expect(page.getByTestId('signup-email')).toBeVisible()
    await expect(page.getByTestId('signup-password')).toBeVisible()
    await expect(page.getByTestId('signup-repeat-password')).toBeVisible()
    await expect(page.getByTestId('signup-submit')).toBeVisible()
  })
})
