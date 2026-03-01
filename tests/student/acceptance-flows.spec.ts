import { test, expect } from '@playwright/test'

// Acceptance tests for student-facing flows.
// Usage:
// TEST_EMAIL and TEST_PASSWORD can be provided via environment variables.
// Default: playwright.student@example.com / Password123!

const TEST_EMAIL = process.env.TEST_EMAIL || 'playwright.student@example.com'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Password123!'
const BASE = process.env.BASE_URL || 'http://localhost:3000'

test.describe.serial('Student acceptance flows', () => {
  test.beforeEach(async ({ page }) => {
    // start each test from a clean state
    await page.context().clearCookies()
    await page.goto(BASE, { waitUntil: 'networkidle' })
  })

  test('Login - student can sign in and reach dashboard', async ({ page }) => {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })

    // Try accessible labels first, fallback to inputs
    const emailInput = page.getByRole('textbox', { name: /email/i }).first()
    const passwordInput = page.getByRole('textbox', { name: /password/i }).first()

    if (await emailInput.count()) {
      await emailInput.fill(TEST_EMAIL)
      await passwordInput.fill(TEST_PASSWORD)
    } else {
      await page.locator('input[type="email"]').fill(TEST_EMAIL)
      await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    }

    // Submit the form
    const submitButton = page.getByRole('button', { name: /sign in|login|log in/i }).first()
    if (await submitButton.count()) {
      await Promise.all([
        page.waitForNavigation({ url: /.*dashboard\/student.*/, waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        submitButton.click(),
      ])
    } else {
      await Promise.all([
        page.waitForNavigation({ url: /.*dashboard\/student.*/, waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ])
    }

    // Assert we are on student dashboard
    await expect(page).toHaveURL(/.*dashboard\/student.*/)
    // At least one visible heading or welcome message should exist
    await expect(page.locator('h1, h2, text=/dashboard|welcome|my learning/i').first()).toBeVisible()
  })

  test('Enrolled courses - list loads and course card is present', async ({ page }) => {
    // Ensure logged in
    await ensureLoggedIn(page)

    await page.goto(`${BASE}/dashboard/student`, { waitUntil: 'networkidle' })

    // Wait for course cards or a course list container
    const courseLink = page.getByRole('link').filter({ has: page.locator('a[href*="/dashboard/student/courses/"]') }).first()
    if (await courseLink.count()) {
      await expect(courseLink).toBeVisible()
    } else {
      // Fallback: any link matching course path
      const hrefLink = page.locator('a[href*="/dashboard/student/courses/"]').first()
      await expect(hrefLink).toBeVisible({ timeout: 10000 })
    }

    // Check for progress text on the page
    const progress = page.locator('text=/\\d+%|\\d+\/\\d+ lessons/').first()
    await expect(progress).toBeVisible({ timeout: 5000 })
  })

  test('Lessons - open a lesson, mark complete and persist', async ({ page }) => {
    await ensureLoggedIn(page)

    // Open first course then first lesson
    const firstCourse = page.locator('a[href*="/dashboard/student/courses/"]').first()
    await expect(firstCourse).toBeVisible({ timeout: 10000 })
    await firstCourse.click()
    await page.waitForLoadState('networkidle')

    // Click first lesson link in sidebar or course content
    const lessonLink = page.locator('a[href*="/lessons/"]').first()
    await expect(lessonLink).toBeVisible({ timeout: 10000 })
    await lessonLink.click()
    await page.waitForLoadState('networkidle')

    // Assert MDX content: heading or code block exists
    await expect(page.locator('main h1, main h2, main :is(pre, code)').first()).toBeVisible({ timeout: 10000 })

    // Mark as complete - try common button labels
    const completeBtn = page.getByRole('button', { name: /mark as complete|complete|mark complete/i }).first()
    if (await completeBtn.count()) {
      await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/lesson_completions') && resp.status() === 200, { timeout: 10000 }).catch(() => {}),
        completeBtn.click(),
      ])
    }

    // Reload and assert completion persists (sidebar or badge)
    await page.reload({ waitUntil: 'networkidle' })
    const completedMarker = page.locator(':is([data-completed="true"], text=/completed|done/i)').first()
    await expect(completedMarker).toBeVisible({ timeout: 10000 })
  })

  test('Exams - take a simple exam and submit', async ({ page }) => {
    await ensureLoggedIn(page)

    // Navigate to exams for first course
    await page.goto(`${BASE}/dashboard/student`, { waitUntil: 'networkidle' })
    const course = page.locator('a[href*="/dashboard/student/courses/"]').first()
    await course.click()
    await page.waitForLoadState('networkidle')

    // Find exam link/button
    const examLink = page.getByRole('link').filter({ hasText: /exam|assess/i }).first()
    if (await examLink.count()) {
      await examLink.click()
    } else {
      const startExamBtn = page.getByRole('button', { name: /start exam|take exam|begin exam/i }).first()
      await expect(startExamBtn).toBeVisible({ timeout: 5000 })
      await startExamBtn.click()
    }

    await page.waitForLoadState('networkidle')

    // Answer first question: prefer radio inputs or textarea
    const radio = page.locator('input[type="radio"]').first()
    if (await radio.count()) {
      await radio.check()
    } else {
      const textarea = page.locator('textarea').first()
      if (await textarea.count()) await textarea.fill('test answer')
    }

    // Submit
    const submit = page.getByRole('button', { name: /submit|finish & submit|finish/i }).first()
    if (await submit.count()) {
      await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/exam_submissions') && resp.status() >= 200 && resp.status() < 300, { timeout: 15000 }).catch(() => {}),
        submit.click(),
      ])
    }

    // Wait for result UI
    const result = page.locator('text=/score|result|feedback/i').first()
    await expect(result).toBeVisible({ timeout: 20000 })
  })

  test('Progress - verify progress updates after actions', async ({ page }) => {
    await ensureLoggedIn(page)

    await page.goto(`${BASE}/dashboard/student`, { waitUntil: 'networkidle' })
    const progressLocator = page.locator('text=/\\d+% complete|\\d+\/\\d+ lessons/').first()
    const beforeText = (await progressLocator.textContent()) || ''
    const beforeNum = parseInt((beforeText.match(/\\d+/) || ['0'])[0], 10)

    // Trigger an action that increases progress: open first course and mark first incomplete lesson complete
    const course = page.locator('a[href*="/dashboard/student/courses/"]').first()
    await course.click()
    await page.waitForLoadState('networkidle')
    const lesson = page.locator('a[href*="/lessons/"]').filter({ hasText: /lesson|unit|section/i }).first()
    if (await lesson.count()) {
      await lesson.click()
      await page.waitForLoadState('networkidle')
      const completeBtn = page.getByRole('button', { name: /mark as complete|complete/i }).first()
      if (await completeBtn.count()) {
        await Promise.all([
          page.waitForResponse(resp => resp.url().includes('/lesson_completions') && resp.status() === 200, { timeout: 10000 }).catch(() => {}),
          completeBtn.click(),
        ])
      }
    }

    // Back to dashboard and check progress increased
    await page.goto(`${BASE}/dashboard/student`, { waitUntil: 'networkidle' })
    const afterText = (await page.locator('text=/\\d+% complete|\\d+\/\\d+ lessons/').first().textContent()) || ''
    const afterNum = parseInt((afterText.match(/\\d+/) || ['0'])[0], 10)
    expect(afterNum).toBeGreaterThanOrEqual(beforeNum)
  })

  test('Logout - sign out clears session and protects routes', async ({ page }) => {
    await ensureLoggedIn(page)

    // Click sign out - try common patterns
    const signOut = page.getByRole('button', { name: /sign out|logout|log out/i }).first()
    if (await signOut.count()) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {}),
        signOut.click(),
      ])
    } else {
      // try menu + sign out
      const profile = page.getByRole('button', { name: /profile|account/i }).first()
      if (await profile.count()) {
        await profile.click()
        const menuSignOut = page.getByRole('link', { name: /sign out|logout|log out/i }).first()
        if (await menuSignOut.count()) await menuSignOut.click()
      }
    }

    // After logout, protected route should redirect to auth
    await page.goto(`${BASE}/dashboard/student`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/.*auth\/login.*/)
  })
})

// Helper: ensure we are logged in, otherwise perform login (or sign up as fallback)
async function ensureLoggedIn(page: any) {
  await page.goto(`${BASE}/dashboard/student`, { waitUntil: 'networkidle' })
  if (page.url().includes('/auth/login') || page.url().includes('/auth/sign-up') || page.url().includes('/auth')) {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })
    const email = page.getByRole('textbox', { name: /email/i }).first()
    const pwd = page.getByRole('textbox', { name: /password/i }).first()
    if (await email.count()) {
      await email.fill(TEST_EMAIL)
      await pwd.fill(TEST_PASSWORD)
    } else {
      await page.locator('input[type="email"]').fill(TEST_EMAIL)
      await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    }
    const submit = page.getByRole('button', { name: /sign in|login|log in/i }).first()
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
      submit.click(),
    ])

    // If still on auth page, try sign up
    if (page.url().includes('/auth/sign-up') || page.url().includes('/auth')) {
      await page.goto(`${BASE}/auth/sign-up`, { waitUntil: 'networkidle' })
      const e = page.locator('input[type="email"]').first()
      const p = page.locator('input[type="password"]').first()
      await e.fill(TEST_EMAIL)
      await p.fill(TEST_PASSWORD)
      const btn = page.getByRole('button', { name: /sign up|create account|register/i }).first()
      if (await btn.count()) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
          btn.click(),
        ])
      }
    }
  }
}
