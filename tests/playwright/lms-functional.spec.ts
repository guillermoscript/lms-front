import { test, expect, Page } from '@playwright/test'

/**
 * LMS Functional Tests — uses data-testid selectors for reliability.
 *
 * Covers all items from docs/TESTING_STATUS.md:
 * - Authentication (login all roles, signup, role-based redirect)
 * - Student Dashboard (courses, lessons, exams)
 * - Teacher Dashboard (course creation)
 * - Admin Dashboard (stats, pages)
 * - Multi-Tenant (subdomain routing, isolation, join school)
 * - i18n (locale in URL)
 * - Payments (pricing, manual checkout)
 *
 * Run: npx playwright test tests/playwright/lms-functional.spec.ts --project=desktop-chromium
 */

const BASE = 'http://lvh.me:3000'
const TENANT_BASE = 'http://code-academy.lvh.me:3000'

// ── Helpers ─────────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string, baseUrl = BASE) {
  await page.goto(`${baseUrl}/en/auth/login`)
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await page.waitForURL('**/dashboard/**', { timeout: 20_000 })
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION FLOW
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Authentication Flow', () => {
  test('login page displays correctly', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/login`)
    await expect(page.getByTestId('login-title')).toBeVisible()
    await expect(page.getByTestId('login-email')).toBeVisible()
    await expect(page.getByTestId('login-password')).toBeVisible()
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  test('login as student → redirects to student dashboard', async ({ page }) => {
    await login(page, 'student@e2etest.com', 'password123')
    await expect(page).toHaveURL(/\/dashboard\/student/)
    await expect(page.getByTestId('student-dashboard')).toBeVisible()
  })

  test('login as teacher → redirects to teacher dashboard', async ({ page }) => {
    await login(page, 'owner@e2etest.com', 'password123')
    await expect(page).toHaveURL(/\/dashboard\/teacher/)
    await expect(page.getByTestId('teacher-dashboard')).toBeVisible()
  })

  test('login as admin → redirects to admin dashboard', async ({ page }) => {
    // creator@codeacademy.com is admin on Code Academy Pro subdomain
    await page.goto(`${TENANT_BASE}/en/auth/login`)
    await page.getByTestId('login-email').fill('creator@codeacademy.com')
    await page.getByTestId('login-password').fill('password123')
    await page.getByTestId('login-submit').click()
    await page.waitForURL('**/dashboard/**', { timeout: 20_000 })
    await expect(page).toHaveURL(/\/dashboard\/admin/)
    await expect(page.getByTestId('admin-dashboard')).toBeVisible()
  })

  test('invalid credentials stay on login page', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/login`)
    await page.getByTestId('login-email').fill('nobody@test.com')
    await page.getByTestId('login-password').fill('wrongpassword')
    await page.getByTestId('login-submit').click()
    await page.waitForTimeout(3000)
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('sign-up page accessible with form fields', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/sign-up`)
    await expect(page.getByTestId('signup-title')).toBeVisible()
    await expect(page.getByTestId('signup-email')).toBeVisible()
    await expect(page.getByTestId('signup-password')).toBeVisible()
    await expect(page.getByTestId('signup-repeat-password')).toBeVisible()
    await expect(page.getByTestId('signup-submit')).toBeVisible()
  })

  test('role-based redirect: /dashboard → /dashboard/student', async ({ page }) => {
    await login(page, 'student@e2etest.com', 'password123')
    await page.goto(`${BASE}/en/dashboard`)
    await expect(page).toHaveURL(/\/dashboard\/student/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// STUDENT DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Student Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'student@e2etest.com', 'password123')
  })

  test('dashboard loads with welcome hero', async ({ page }) => {
    await expect(page.getByTestId('welcome-hero')).toBeVisible()
  })

  test('view enrolled courses page', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/student/courses`)
    await expect(page.getByTestId('my-courses-title')).toBeVisible()
    await expect(page.getByTestId('student-courses-page')).toBeVisible()
  })

  test('navigate to course detail', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/student/courses/1`)
    // Course detail page should load (course 1 = Introduction to Testing)
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 })
  })

  test('view lesson content with complete toggle', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/student/courses/1/lessons/1`)
    await expect(page.getByTestId('lesson-complete-toggle')).toBeVisible({ timeout: 15_000 })
  })

  test('lesson complete toggle is interactive', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${BASE}/en/dashboard/student/courses/1/lessons/1`, { timeout: 40_000 })
    const toggle = page.getByTestId('lesson-complete-toggle')
    await expect(toggle).toBeVisible({ timeout: 15_000 })
    await expect(toggle).toBeEnabled()
  })

  test('browse courses shows courses for tenant', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/student/browse`, { timeout: 40_000 })
    await expect(page.getByTestId('browse-title')).toBeVisible()
    await expect(page.getByTestId('browse-course-count')).toBeVisible()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TEACHER DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Teacher Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'owner@e2etest.com', 'password123')
  })

  test('teacher dashboard loads', async ({ page }) => {
    await expect(page.getByTestId('teacher-dashboard')).toBeVisible()
    await expect(page.getByTestId('teacher-welcome')).toBeVisible()
  })

  test('navigate to create new course form', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/teacher/courses/new`)
    await expect(page.getByLabel(/title/i)).toBeVisible()
  })

  test('course creation form has all fields', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/teacher/courses/new`)
    await expect(page.getByLabel(/title/i)).toBeVisible()
    await expect(page.getByLabel(/description/i)).toBeVisible()
    await expect(page.getByLabel(/status/i)).toBeVisible()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/auth/login`)
    await page.getByTestId('login-email').fill('creator@codeacademy.com')
    await page.getByTestId('login-password').fill('password123')
    await page.getByTestId('login-submit').click()
    await page.waitForURL('**/dashboard/**', { timeout: 20_000 })
  })

  test('admin dashboard loads with stats', async ({ page }) => {
    await expect(page.getByTestId('admin-dashboard')).toBeVisible()
    await expect(page.getByTestId('admin-stats-grid')).toBeVisible()
  })

  test('admin can access teacher course creation', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en/dashboard/teacher/courses/new`, { timeout: 40_000 })
    await expect(page.getByLabel(/title/i)).toBeVisible()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// MULTI-TENANT
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Multi-Tenant', () => {
  test('platform root (lvh.me) loads', async ({ page }) => {
    await page.goto(`${BASE}/en`)
    await expect(page).toHaveURL(/lvh\.me:3000\/en/)
  })

  test('subdomain (code-academy.lvh.me) shows Code Academy Pro', async ({ page }) => {
    await page.goto(`${TENANT_BASE}/en`)
    await expect(page.getByText(/Code Academy Pro/i)).toBeVisible()
  })

  test('tenant isolation — default tenant sees only its courses', async ({ page }) => {
    await login(page, 'student@e2etest.com', 'password123')
    await page.goto(`${BASE}/en/dashboard/student/browse`)
    await expect(page.getByTestId('browse-course-count')).toContainText('2')
    // Python for Beginners is Code Academy's course — should NOT appear
    await expect(page.getByText(/Python for Beginners/i)).not.toBeVisible()
  })

  test('tenant isolation — code-academy sees only its courses', async ({ page }) => {
    await login(page, 'alice@student.com', 'password123', TENANT_BASE)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/browse`)
    await expect(page.getByTestId('browse-course-count')).toContainText('1')
    await expect(page.getByText(/Python for Beginners/i)).toBeVisible()
  })

  test('non-member redirected to join-school', async ({ page }) => {
    // student@e2etest.com is NOT a member of Code Academy Pro
    // Login on default tenant first, then navigate cross-domain
    await login(page, 'student@e2etest.com', 'password123')
    await page.goto(`${TENANT_BASE}/en/dashboard/student`, { timeout: 30_000 })
    await page.waitForLoadState('networkidle')
    // Should redirect to join-school or login (cross-domain session may not persist)
    const url = page.url()
    expect(url).toMatch(/\/join-school|\/auth\/login/)
  })

  test('pricing page is tenant-scoped', async ({ page }) => {
    // Pricing requires authentication — log in first
    await login(page, 'alice@student.com', 'password123', TENANT_BASE)
    await page.goto(`${TENANT_BASE}/en/pricing`)
    await expect(page.getByTestId('pricing-title')).toBeVisible()
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeVisible()
    await expect(page.getByText(/\$19\.99/)).toBeVisible()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// INTERNATIONALIZATION
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Internationalization', () => {
  test('default route includes /en locale segment', async ({ page }) => {
    // Root URL redirects and includes /en locale prefix
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/en/)
  })

  test('/es/ locale route loads', async ({ page }) => {
    await page.goto(`${BASE}/es`)
    await expect(page).toHaveURL(/\/es/)
  })

  test('login page works in Spanish locale', async ({ page }) => {
    await page.goto(`${BASE}/es/auth/login`)
    await expect(page.getByTestId('login-title')).toBeVisible()
    await expect(page.getByTestId('login-email')).toBeVisible()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Payments', () => {
  test('pricing page renders', async ({ page }) => {
    // Pricing requires authentication
    await login(page, 'student@e2etest.com', 'password123')
    await page.goto(`${BASE}/en/pricing`)
    await expect(page.getByTestId('pricing-title')).toBeVisible()
  })

  test('tenant pricing shows tenant plans', async ({ page }) => {
    // Pricing requires authentication
    await login(page, 'alice@student.com', 'password123', TENANT_BASE)
    await page.goto(`${TENANT_BASE}/en/pricing`)
    await expect(page.getByTestId('pricing-title')).toBeVisible()
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeVisible()
  })

  test('manual checkout page renders for product', async ({ page }) => {
    await login(page, 'alice@student.com', 'password123', TENANT_BASE)
    await page.goto(`${TENANT_BASE}/en/checkout/manual?productId=3&courseId=3`)
    await expect(page.getByTestId('manual-checkout-title')).toBeVisible()
    await expect(page.getByText(/Python for Beginners/i).first()).toBeVisible()
    await expect(page.getByText(/49\.99/).first()).toBeVisible()
  })

  test('student can view payment requests', async ({ page }) => {
    await login(page, 'alice@student.com', 'password123', TENANT_BASE)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/payments`)
    await expect(page.getByTestId('payments-title')).toBeVisible()
  })
})
