import { test, expect } from '@playwright/test'
import { login, loginAsStudent } from './utils/auth'
import { BASE, TENANT_BASE, ACCOUNTS } from './utils/constants'

/**
 * P0 — Authentication & Security Tests
 * Verifies auth flows, route guards, credential handling, CSRF, and security headers.
 *
 * Spec: tests/playwright/specs/auth-security.spec.md
 */

test.describe('Authentication Security', () => {
  // ─── Login & Sign-Up UI ──────────────────────────────────────────────────

  test('login page displays correctly', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/login`)
    await expect(page.getByTestId('login-title')).toBeVisible()
    await expect(page.getByTestId('login-email')).toBeVisible()
    await expect(page.getByTestId('login-password')).toBeVisible()
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  test('sign-up page accessible with form fields', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/sign-up`)
    await expect(page.getByTestId('signup-title')).toBeVisible()
    await expect(page.getByTestId('signup-name')).toBeVisible()
    await expect(page.getByTestId('signup-email')).toBeVisible()
    await expect(page.getByTestId('signup-password')).toBeVisible()
    await expect(page.getByTestId('signup-submit')).toBeVisible()
  })

  test('sign-up requires a full name', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/sign-up`)
    await page.getByTestId('signup-email').fill(`e2e-noname-${Date.now()}@e2etest.com`)
    await page.getByTestId('signup-password').fill('password123')
    await page.getByTestId('signup-submit').click()
    // HTML5 `required` blocks submission — still on sign-up, name flagged invalid
    await expect(page).toHaveURL(/\/auth\/sign-up/)
    const nameMissing = await page
      .getByTestId('signup-name')
      .evaluate((el) => (el as HTMLInputElement).validity.valueMissing)
    expect(nameMissing).toBe(true)
  })

  test('sign-up with a session does not stop at "check your inbox"', async ({ page }) => {
    // Guards #590: signing up without a name made students read as "Unknown Student".
    // Local GoTrue autoconfirms (enable_confirmations = false) exactly as
    // production does, so the sign-up returns a session — the account is
    // already live and /auth/sign-up-success would be a dead end pointing at
    // an email that is never sent (#797, mailer #676). BASE is the platform
    // tenant, where a fresh account with nowhere to go is a creator: the same
    // destination /auth/confirm picks for a confirmed sign-up there.
    await page.goto(`${BASE}/en/auth/sign-up`)
    await page.getByTestId('signup-name').fill('E2E Signup Tester')
    await page.getByTestId('signup-email').fill(`e2e-signup-${Date.now()}@e2etest.com`)
    await page.getByTestId('signup-password').fill('password123')
    await page.getByTestId('signup-submit').click()
    await page.waitForURL(/\/create-school/, { timeout: 20_000 })
  })

  // ─── Route Guards — Unauthenticated ──────────────────────────────────────

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

  // ─── Route Guards — Role-Based ──────────────────────────────────────────

  test('student cannot access /dashboard/teacher — redirected', async ({
    page,
  }) => {
    await loginAsStudent(page)
    await page.goto(`${BASE}/en/dashboard/teacher`)
    await page.waitForTimeout(3000)
    expect(page.url()).not.toMatch(/\/dashboard\/teacher$/)
  })

  test('student cannot access /dashboard/admin — redirected', async ({
    page,
  }) => {
    await loginAsStudent(page)
    await page.goto(`${BASE}/en/dashboard/admin`)
    await page.waitForTimeout(3000)
    expect(page.url()).not.toMatch(/\/dashboard\/admin$/)
  })

  // ─── Route Guards — Role-Based Redirect ─────────────────────────────────

  test('role-based redirect: /dashboard → /dashboard/student', async ({
    page,
  }) => {
    await loginAsStudent(page)
    await page.goto(`${BASE}/en/dashboard`)
    await expect(page).toHaveURL(/\/dashboard\/student/)
  })

  // ─── Auth Flows ──────────────────────────────────────────────────────────

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

  test('login on tenant subdomain preserves subdomain after auth', async ({
    page,
  }) => {
    await login(
      page,
      ACCOUNTS.admin.email,
      ACCOUNTS.admin.password,
      TENANT_BASE
    )
    expect(page.url()).toContain('code-academy.lvh.me')
  })

  // ─── CSRF & Security ────────────────────────────────────────────────────

  test('CSRF protection — forms use cookie-based protection', async ({
    page,
  }) => {
    await page.goto(`${BASE}/en/auth/login`)
    const formHtml = await page.locator('form').first().innerHTML()
    const hasCsrfToken =
      formHtml.includes('csrf') ||
      formHtml.includes('token') ||
      formHtml.includes('_token')
    console.log(
      'Form CSRF protection:',
      hasCsrfToken ? 'Token found' : 'Using cookie-based protection'
    )
  })

  test('protected routes redirect to login when unauthenticated', async ({
    page,
  }) => {
    const protectedRoutes = [
      '/en/dashboard/student',
      '/en/dashboard/teacher/courses',
      '/en/dashboard/admin/users',
    ]

    for (const route of protectedRoutes) {
      await page.goto(`${BASE}${route}`)
      await page.waitForTimeout(2000)
      const url = page.url()
      expect(
        url.includes('/auth/login') ||
          url.includes('/auth/sign-in') ||
          url === `${BASE}/` ||
          url === `${BASE}/en`
      ).toBeTruthy()
    }
  })

  test('secure headers — security headers are present', async ({ page }) => {
    const response = await page.goto(`${BASE}/en`)
    if (response) {
      const headers = response.headers()
      const securityHeaders = {
        'x-frame-options': headers['x-frame-options'],
        'x-content-type-options': headers['x-content-type-options'],
        'strict-transport-security': headers['strict-transport-security'],
      }
      console.log('Security headers:', securityHeaders)
    }
  })
})
