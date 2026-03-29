import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

/**
 * P1 — Student Exam Flow Tests
 *
 * Covers exam list, exam taker UI, question interaction, and result viewing.
 * Uses Code Academy tenant with alice@student.com.
 *
 * Seeded data:
 * - Course 2001 "Python for Beginners" on Code Academy (tenant 00000000-0000-0000-0000-000000000002)
 * - Exam 2001 "Python Fundamentals — Final Exam" (10 questions, 60 min)
 * - Product 2001 "Python Mastery Bundle" covers course 2001
 * - Alice (a1000000-0000-0000-0000-000000000004) enrolled in course 2002 but NOT 2001
 *
 * Setup: beforeAll seeds enrollment for Alice in course 2001 via product 2001
 * Teardown: afterAll removes the seeded enrollment + any exam submissions
 *
 * UI verified via Playwright MCP browser (2026-03-16):
 * - Exams list: h1 "Assessments", h3 exam title, "60 minutes", "Start Exam" button
 * - Exam taker: h1 exam title, "Progress: 0/10", "Time Left" + "60:00",
 *   "Question 1" label, h2 question text, radiogroup with true/false options,
 *   "Previous" (disabled) + "Next Question" buttons
 * - Last question: data-testid="exam-finish-submit" button
 *
 * IMPORTANT: Tests NEVER click the submit button to avoid creating exam_submissions.
 *
 * Spec: tests/playwright/specs/student-exams.spec.md
 */

const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const COURSE_ID = '2001'
const EXAM_ID = '2001'
const PRODUCT_ID = 2001

const COURSE_URL = `${TENANT_BASE}/en/dashboard/student/courses/${COURSE_ID}`
const EXAMS_LIST_URL = `${COURSE_URL}/exams`
const EXAM_TAKER_URL = `${EXAMS_LIST_URL}/${EXAM_ID}`

/* ------------------------------------------------------------------ */
/*  Supabase admin client (service_role — bypasses RLS)                */
/* ------------------------------------------------------------------ */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getAdmin() {
  return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

let seededEnrollmentId: number | null = null

/* ------------------------------------------------------------------ */
/*  Setup & Teardown                                                   */
/* ------------------------------------------------------------------ */
test.beforeAll(async () => {
  const admin = getAdmin()

  // Clean any prior test enrollment and exam submissions
  await admin.from('exam_submissions').delete().eq('student_id', ALICE_ID).eq('exam_id', Number(EXAM_ID))
  await admin.from('enrollments').delete().eq('user_id', ALICE_ID).eq('course_id', Number(COURSE_ID))

  // Seed enrollment: Alice in course 2001 via product 2001
  const { data, error } = await admin
    .from('enrollments')
    .insert({
      user_id: ALICE_ID,
      course_id: Number(COURSE_ID),
      tenant_id: CODE_ACADEMY_TENANT,
      product_id: PRODUCT_ID,
      status: 'active',
    })
    .select('enrollment_id')
    .single()

  if (error) throw new Error(`Failed to seed enrollment: ${error.message}`)
  seededEnrollmentId = data.enrollment_id
})

test.afterAll(async () => {
  const admin = getAdmin()

  // Clean exam submissions (in case a test accidentally submitted)
  await admin.from('exam_submissions').delete().eq('student_id', ALICE_ID).eq('exam_id', Number(EXAM_ID))

  // Clean seeded enrollment
  if (seededEnrollmentId) {
    await admin.from('enrollments').delete().eq('enrollment_id', seededEnrollmentId)
  }
})

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */
test.describe('Student Exam Flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantStudent(page)
  })

  // ── 1. Exams List Page ──────────────────────────────────────────────

  test.describe('Exams List Page', () => {
    test('exams list page loads with exam title', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAMS_LIST_URL, { timeout: 30_000 })

      // h1 "Assessments"
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // Exam title in h3
      await expect(page.getByRole('heading', { name: /Python Fundamentals/i })).toBeVisible({ timeout: 10_000 })
    })

    test('exam card shows duration and status', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAMS_LIST_URL, { timeout: 30_000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // Duration: "60 minutes"
      await expect(page.getByText(/60 minutes/i).first()).toBeVisible({ timeout: 10_000 })

      // Status: "Not Started" or "Start Exam" button
      const status = page.getByText(/Not Started|Start Exam/i)
      await expect(status.first()).toBeVisible({ timeout: 10_000 })
    })

    test('exam card has Start Exam action', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAMS_LIST_URL, { timeout: 30_000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // "Start Exam" link/button
      const startButton = page.getByRole('link', { name: /Start Exam/i })
      await expect(startButton).toBeVisible({ timeout: 10_000 })

      // Links to the exam taker URL
      await expect(startButton).toHaveAttribute('href', /\/exams\/2001/)
    })
  })

  // ── 2. Exam Taker UI ───────────────────────────────────────────────

  test.describe('Exam Taker UI', () => {
    test('exam taker loads with title, progress, and timer', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })

      // h1: exam title
      await expect(
        page.getByRole('heading', { name: /Python Fundamentals/i, level: 1 })
      ).toBeVisible({ timeout: 15_000 })

      // Progress: "Progress: 0/10" (MCP verified)
      await expect(page.getByText(/Progress.*0\/10/i)).toBeVisible({ timeout: 10_000 })

      // Timer: "Time Left" with MM:SS
      await expect(page.getByText(/Time Left/i)).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/\d+:\d{2}/)).toBeVisible({ timeout: 5_000 })
    })

    test('first question shows Question 1 label and question text', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // "Question 1" indicator
      await expect(page.getByText(/Question 1/i)).toBeVisible({ timeout: 10_000 })

      // h2: question text
      await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 })
    })

    test('navigation buttons: Previous disabled, Next Question visible', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // Previous button disabled on first question
      const prevButton = page.getByRole('button', { name: /Previous/i })
      await expect(prevButton).toBeVisible({ timeout: 10_000 })
      await expect(prevButton).toBeDisabled()

      // Next Question button enabled
      const nextButton = page.getByRole('button', { name: /Next Question/i })
      await expect(nextButton).toBeVisible({ timeout: 10_000 })
      await expect(nextButton).toBeEnabled()
    })

    test('question shows answer options (radiogroup)', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // Radiogroup with options (true/false or multiple choice)
      const radiogroup = page.getByRole('radiogroup')
      await expect(radiogroup).toBeVisible({ timeout: 10_000 })

      // At least 2 radio options
      const radios = page.getByRole('radio')
      const count = await radios.count()
      expect(count).toBeGreaterThanOrEqual(2)
    })
  })

  // ── 3. Exam Interaction ─────────────────────────────────────────────

  test.describe('Exam Question Interaction', () => {
    test('can select answer, navigate to question 2, and navigate back', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // Select first radio option
      const firstRadio = page.getByRole('radio').first()
      await expect(firstRadio).toBeVisible({ timeout: 10_000 })
      await firstRadio.click({ force: true })

      // Progress updates to 1/10
      await expect(page.getByText(/Progress.*1\/10/i)).toBeVisible({ timeout: 5_000 })

      // Click Next Question
      await page.getByRole('button', { name: /Next Question/i }).click()

      // Now on Question 2
      await expect(page.getByText(/Question 2/i)).toBeVisible({ timeout: 5_000 })

      // Previous button now enabled
      const prevButton = page.getByRole('button', { name: /Previous/i })
      await expect(prevButton).toBeEnabled()

      // Navigate back to Question 1
      await prevButton.click()
      await expect(page.getByText(/Question 1/i)).toBeVisible({ timeout: 5_000 })
    })

    test('last question shows Finish & Submit button (without clicking it)', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

      // Navigate to last question by clicking Next repeatedly
      const nextButton = page.getByRole('button', { name: /Next Question/i })
      let hasNext = await nextButton.isVisible({ timeout: 5_000 }).catch(() => false)

      while (hasNext) {
        await nextButton.click()
        await page.waitForTimeout(300)
        hasNext = await nextButton.isVisible({ timeout: 2_000 }).catch(() => false)
      }

      // On last question: Finish & Submit button (data-testid="exam-finish-submit")
      const submitButton = page.getByTestId('exam-finish-submit')
      await expect(submitButton).toBeVisible({ timeout: 5_000 })
      await expect(submitButton).toBeEnabled()

      // Verify button text
      const buttonText = await submitButton.textContent()
      expect(buttonText).toMatch(/Finish.*Submit/i)

      // DO NOT click — just verify it exists
    })
  })
})
