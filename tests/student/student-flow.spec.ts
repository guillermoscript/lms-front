import { test, expect, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(__dirname, '../../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Helper: login via UI
async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard/student', { timeout: 15000 })
}

// Helper: cleanup test user data (respects FK ordering)
async function cleanupUser(userId: string) {
  await supabase.from('lesson_completions').delete().eq('user_id', userId)
  await supabase.from('enrollments').delete().eq('user_id', userId)
  await supabase.from('subscriptions').delete().eq('user_id', userId)
  await supabase.from('transactions').delete().eq('user_id', userId)
  await supabase.from('user_roles').delete().eq('user_id', userId)
  await supabase.from('profiles').delete().eq('id', userId)
  await supabase.auth.admin.deleteUser(userId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow A: Plan Subscription → Browse → Manual Enroll → Lesson Completion
// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Flow A: Plan Subscription → Browse → Enroll → Lesson Completion', () => {
  const testEmail = `flow-a-${Date.now()}@test.com`
  const testPassword = 'TestPassword123!'
  let testUserId: string

  let courseId: number
  let firstLessonId: number

  test.beforeAll(async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    })
    if (error) throw new Error(`Failed to create test user: ${error.message}`)
    testUserId = data.user.id

    // Fetch a published course and its first lesson for later tests
    const { data: courses } = await supabase
      .from('courses')
      .select('course_id, title')
      .eq('status', 'published')
      .limit(1)

    if (!courses || courses.length === 0) throw new Error('No published courses found')
    courseId = courses[0].course_id

    const { data: lessons } = await supabase
      .from('lessons')
      .select('lesson_id')
      .eq('course_id', courseId)
      .eq('status', 'published')
      .order('sequence', { ascending: true })
      .limit(1)

    if (!lessons || lessons.length === 0) throw new Error('No published lessons found')
    firstLessonId = lessons[0].lesson_id
  })

  test.afterAll(async () => {
    if (testUserId) {
      await cleanupUser(testUserId)
    }
  })

  // ── Public pages ──────────────────────────────────────────────────────────

  test('Landing page renders with correct CTA links', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Master Your Future')).toBeVisible()
    await expect(page.locator('text=Get Started Free')).toBeVisible()

    const cta = page.locator('a:has-text("Get Started Free")')
    await expect(cta).toHaveAttribute('href', '/auth/sign-up')
  })

  test('Courses listing page shows published courses', async ({ page }) => {
    await page.goto('/courses')
    await page.waitForSelector('a[href*="/courses/"]', { timeout: 10000 })
    const courseLinks = page.locator('a[href*="/courses/"]')
    expect(await courseLinks.count()).toBeGreaterThan(0)
  })

  test('Course detail page shows lessons and enroll button', async ({ page }) => {
    await page.goto(`/courses/${courseId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('text=Enroll Now')).toBeVisible()
  })

  test('Pricing page shows plans with correct prices', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.locator('text=Choose Your Learning Path')).toBeVisible()
    await expect(page.locator('text=Basic')).toBeVisible()

    const getStartedButtons = page.locator('button:has-text("Get Started"), a:has-text("Get Started")')
    expect(await getStartedButtons.count()).toBeGreaterThan(0)
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  test('Login with test user redirects to student dashboard', async ({ page }) => {
    await login(page, testEmail, testPassword)
    await expect(page).toHaveURL(/\/dashboard\/student/)
  })

  // ── Plan purchase → redirects to browse ───────────────────────────────────

  test('Checkout plan purchase redirects to browse page', async ({ page }) => {
    await login(page, testEmail, testPassword)

    const { data: plans } = await supabase
      .from('plans')
      .select('plan_id, price')
      .gt('price', 0)
      .limit(1)

    expect(plans).toBeTruthy()
    expect(plans!.length).toBeGreaterThan(0)
    const planId = plans![0].plan_id

    await page.goto(`/checkout?planId=${planId}`)
    await expect(page.locator('text=Checkout')).toBeVisible()

    await page.click('button:has-text("Pay & Enroll (Test)")')

    // Plan purchase should redirect to browse page (not dashboard)
    await page.waitForURL('**/dashboard/student/browse', { timeout: 15000 })
  })

  test('DB: subscription and transaction created', async () => {
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'successful')

    expect(transactions).toBeTruthy()
    expect(transactions!.length).toBeGreaterThanOrEqual(1)

    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', testUserId)
      .eq('subscription_status', 'active')

    expect(subscriptions).toBeTruthy()
    expect(subscriptions!.length).toBe(1)
  })

  // ── Dashboard shows subscription prompt ───────────────────────────────────

  test('Dashboard shows subscription active prompt with browse link', async ({ page }) => {
    await login(page, testEmail, testPassword)

    // No enrollments yet, but has subscription → should see subscription prompt
    await expect(page.locator('text=is active')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Browse & Enroll in Courses')).toBeVisible()
  })

  // ── Browse → manual enroll ────────────────────────────────────────────────

  test('Browse page shows subscription alert and enroll buttons', async ({ page }) => {
    await login(page, testEmail, testPassword)
    await page.goto('/dashboard/student/browse')

    await expect(page.locator('text=Active Subscription')).toBeVisible()
    await expect(page.locator('text=No Active Subscription')).not.toBeVisible()

    // Should show "Enroll Now" buttons since user has subscription
    await expect(page.locator('button:has-text("Enroll Now")').first()).toBeVisible()
  })

  test('Enrolling in course via browse page succeeds', async ({ page }) => {
    await login(page, testEmail, testPassword)
    await page.goto('/dashboard/student/browse')
    await page.waitForLoadState('networkidle')

    const enrollButton = page.locator('button:has-text("Enroll Now")').first()
    await expect(enrollButton).toBeVisible()
    await enrollButton.click()

    // Wait for success toast
    await expect(page.locator('text=Successfully enrolled')).toBeVisible({ timeout: 10000 })
  })

  test('DB: enrollment created with subscription_id', async () => {
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'active')

    expect(enrollments).toBeTruthy()
    expect(enrollments!.length).toBeGreaterThanOrEqual(1)

    const enrollment = enrollments![0]
    expect(enrollment.subscription_id).toBeTruthy()
  })

  // ── Dashboard & course access ─────────────────────────────────────────────

  test('Dashboard now shows enrolled course', async ({ page }) => {
    await login(page, testEmail, testPassword)

    // Should now show the enrolled course (not the empty/subscription prompt)
    await expect(page.locator('text=In-Progress Courses')).toBeVisible()
    await expect(page.locator('text=Browse & Enroll in Courses')).not.toBeVisible({ timeout: 5000 })
  })

  test('Course overview shows curriculum and progress', async ({ page }) => {
    await login(page, testEmail, testPassword)

    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('user_id', testUserId)
      .eq('status', 'active')
      .limit(1)

    const enrolledCourseId = enrollments![0].course_id

    await page.goto(`/dashboard/student/courses/${enrolledCourseId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('text=Curriculum')).toBeVisible()

    const startButton = page.locator('a:has-text("Start Now"), a:has-text("Continue")')
    await expect(startButton.first()).toBeVisible()
  })

  test('Lesson content renders with mark complete button', async ({ page }) => {
    await login(page, testEmail, testPassword)

    await page.goto(`/dashboard/student/courses/${courseId}/lessons/${firstLessonId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=Lesson')).toBeVisible()
    await expect(page.locator('button:has-text("Mark as Complete"), button:has-text("Complete")')).toBeVisible()
  })

  test('Marking lesson complete updates progress', async ({ page }) => {
    await login(page, testEmail, testPassword)

    await page.goto(`/dashboard/student/courses/${courseId}/lessons/${firstLessonId}`)
    await page.waitForLoadState('networkidle')

    const completeButton = page.locator('button:has-text("Mark as Complete"), button:has-text("Complete")')
    await completeButton.first().click()

    // Wait for state change or auto-navigation to next lesson
    await page.waitForTimeout(1500)
  })

  test('DB: lesson_completion row exists', async () => {
    const { data: completions } = await supabase
      .from('lesson_completions')
      .select('*')
      .eq('user_id', testUserId)
      .eq('lesson_id', firstLessonId)

    expect(completions).toBeTruthy()
    expect(completions!.length).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Flow B: Single Course Purchase
// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Flow B: Single Course Purchase', () => {
  const testEmail = `flow-b-${Date.now()}@test.com`
  const testPassword = 'TestPassword123!'
  let testUserId: string
  let courseId: number

  test.beforeAll(async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    })
    if (error) throw new Error(`Failed to create test user: ${error.message}`)
    testUserId = data.user.id

    const { data: productCourses } = await supabase
      .from('product_courses')
      .select('course_id, product:products!inner(product_id, status)')
      .limit(1)

    if (!productCourses || productCourses.length === 0) {
      throw new Error('No product-linked courses found')
    }
    courseId = productCourses[0].course_id
  })

  test.afterAll(async () => {
    if (testUserId) {
      await cleanupUser(testUserId)
    }
  })

  test('Login with test user', async ({ page }) => {
    await login(page, testEmail, testPassword)
    await expect(page).toHaveURL(/\/dashboard\/student/)
  })

  test('Checkout with courseId redirects to dashboard', async ({ page }) => {
    await login(page, testEmail, testPassword)

    await page.goto(`/checkout?courseId=${courseId}`)
    await expect(page.locator('text=Checkout')).toBeVisible()

    await page.click('button:has-text("Pay & Enroll (Test)")')

    // Course purchase should redirect to dashboard (not browse)
    await page.waitForURL('**/dashboard/student', { timeout: 15000 })
  })

  test('DB: transaction and enrollment created with product_id', async () => {
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'successful')

    expect(transactions).toBeTruthy()
    expect(transactions!.length).toBe(1)
    expect(transactions![0].product_id).toBeTruthy()

    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', testUserId)
      .eq('course_id', courseId)
      .eq('status', 'active')

    expect(enrollments).toBeTruthy()
    expect(enrollments!.length).toBe(1)
    expect(enrollments![0].product_id).toBeTruthy()
    expect(enrollments![0].subscription_id).toBeNull()
  })

  test('Dashboard shows enrolled course', async ({ page }) => {
    await login(page, testEmail, testPassword)

    await expect(page.locator('text=No courses yet')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=In-Progress Courses')).toBeVisible()
  })

  test('Course and lesson access works', async ({ page }) => {
    await login(page, testEmail, testPassword)

    await page.goto(`/dashboard/student/courses/${courseId}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('text=Curriculum')).toBeVisible()

    const startButton = page.locator('a:has-text("Start Now"), a:has-text("Continue")')
    await expect(startButton.first()).toBeVisible()
    await startButton.first().click()

    await page.waitForURL(`**/dashboard/student/courses/${courseId}/lessons/**`, { timeout: 10000 })

    await expect(page.locator('text=Lesson')).toBeVisible()
    await expect(page.locator('button:has-text("Mark as Complete"), button:has-text("Complete")')).toBeVisible()
  })
})
