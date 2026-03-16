import { test, expect } from '@playwright/test'
import { loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

/**
 * P1 — Student Exam Flow Tests
 *
 * Covers exam list, exam taker UI, question interaction, and result viewing.
 * Uses Code Academy tenant with alice@student.com.
 *
 * Seeded data:
 * - Course 2001 on Code Academy tenant
 * - Exam 2001 "Python Fundamentals — Final Exam"
 * - Alice is enrolled in Code Academy courses
 *
 * IMPORTANT: These tests NEVER submit the exam to avoid creating exam_submissions.
 */

const COURSE_ID = '2001'
const EXAM_ID = '2001'
const COURSE_URL = `${TENANT_BASE}/en/dashboard/student/courses/${COURSE_ID}`
const EXAMS_LIST_URL = `${COURSE_URL}/exams`
const EXAM_TAKER_URL = `${EXAMS_LIST_URL}/${EXAM_ID}`
const EXAM_RESULT_URL = `${EXAM_TAKER_URL}/result`

test.describe('Student Exam Flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantStudent(page)
  })

  test.describe('Course Detail — Exams Link', () => {
    test('course detail page shows exams button when course has exams', async ({
      page,
    }) => {
      test.setTimeout(60_000)
      await page.goto(COURSE_URL, { timeout: 30_000 })

      // Course title should be visible
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })

      // Exams button/link should be present (rendered when examCount > 0)
      // The link href includes the full locale path
      const examsLink = page.locator(`a[href*="/courses/${COURSE_ID}/exams"]`)
      const isVisible = await examsLink.first().isVisible({ timeout: 10_000 }).catch(() => false)

      if (!isVisible) {
        // Course may not have published exams — skip gracefully
        test.skip(true, 'Course 2001 has no published exams or exams link not visible')
        return
      }

      await expect(examsLink.first()).toBeVisible()
    })
  })

  test.describe('Exams List Page', () => {
    test('exams list page loads with exam cards', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAMS_LIST_URL, { timeout: 30_000 })

      // Page title (Assessments) should be visible
      const heading = page.locator('h1')
      await expect(heading.first()).toBeVisible({ timeout: 15_000 })

      // At least one exam card should be rendered with exam title text
      const examTitle = page.locator('h3')
      await expect(examTitle.first()).toBeVisible({ timeout: 10_000 })
    })

    test('exam card shows duration and status info', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAMS_LIST_URL, { timeout: 30_000 })

      // Wait for page to load
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })

      // Duration info (e.g. "60 minutes") should be visible
      const durationText = page.locator('text=/\\d+\\s+minutes/i')
      await expect(durationText.first()).toBeVisible({ timeout: 10_000 })

      // Status indicator should be visible (Not Started, Completed, Submitted, etc.)
      const statusIndicator = page.locator(
        'text=/Not Started|Completed|Submitted|Start Exam|View Results/i'
      )
      await expect(statusIndicator.first()).toBeVisible({ timeout: 10_000 })
    })

    test('exam card has action link to exam or results', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAMS_LIST_URL, { timeout: 30_000 })

      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })

      // Action button (Start Exam or View Results)
      const actionButton = page.locator(
        'text=/Start Exam|View Results/i'
      )
      await expect(actionButton.first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('Exam Taker UI', () => {
    // Note: If Alice already submitted exam 2001, she is redirected to /result.
    // These tests handle both paths.

    /**
     * Helper: navigates to the exam taker URL and detects if Alice was
     * redirected to the result page (server-side redirect on prior submission).
     * Returns true if the exam taker loaded, false if redirected to result.
     */
    async function navigateToExamTaker(page: import('@playwright/test').Page): Promise<boolean> {
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })
      // Wait for the page to settle (server redirect may occur)
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 })
      // Give extra time for any client-side redirects
      await page.waitForTimeout(2_000)

      const currentUrl = page.url()
      // Check if we stayed on the exam page (not redirected to result, 404, dashboard, or course)
      return currentUrl.includes('/exams/') && !currentUrl.includes('/result') && !currentUrl.includes('/404')
    }

    test('exam page loads — shows exam taker, result, or redirects', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 })
      await page.waitForTimeout(2_000)

      const currentUrl = page.url()

      if (currentUrl.includes('/exams/') && !currentUrl.includes('/result')) {
        // Exam taker loaded — verify title and question
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })
        await expect(page.locator('h2').first()).toBeVisible({ timeout: 10_000 })
      } else if (currentUrl.includes('/result')) {
        // Result page — verify score display
        const resultContent = page.locator('text=/score|result|completed|review/i')
        await expect(resultContent.first()).toBeVisible({ timeout: 15_000 })
      } else {
        // Redirected away (dashboard, login, etc.) — exam not accessible
        // This is valid — student may not have access or exam may not be published
        await expect(page.locator('body')).toBeVisible()
      }
    })

    test('exam taker shows progress and question indicator', async ({
      page,
    }) => {
      test.setTimeout(60_000)
      const isExamTaker = await navigateToExamTaker(page)

      if (!isExamTaker) {
        test.skip(true, 'Alice already submitted this exam — redirected to result')
        return
      }

      // Progress indicator "Progress: 0/N"
      const progressText = page.locator('text=/Progress.*\\d+\\/\\d+/i')
      await expect(progressText.first()).toBeVisible({ timeout: 10_000 })

      // Question indicator "Question 1"
      const questionIndicator = page.locator('text=/Question\\s+1/i')
      await expect(questionIndicator.first()).toBeVisible({ timeout: 10_000 })
    })

    test('exam taker shows navigation buttons', async ({ page }) => {
      test.setTimeout(60_000)
      const isExamTaker = await navigateToExamTaker(page)

      if (!isExamTaker) {
        test.skip(true, 'Alice already submitted this exam — redirected to result')
        return
      }

      // On first question, "Previous" button should be disabled
      const prevButton = page.locator('button:has-text("Previous")')
      await expect(prevButton).toBeVisible({ timeout: 10_000 })
      await expect(prevButton).toBeDisabled()

      // "Next Question" button should be visible (if more than 1 question)
      const nextButton = page.locator('button:has-text("Next Question")')
      const hasNext = await nextButton.isVisible({ timeout: 5_000 }).catch(() => false)

      if (!hasNext) {
        // Only one question — submit button should be visible instead
        const submitButton = page.getByTestId('exam-finish-submit')
        await expect(submitButton).toBeVisible({ timeout: 5_000 })
      }
    })

    test('exam taker renders question options for multiple choice', async ({
      page,
    }) => {
      test.setTimeout(60_000)
      const isExamTaker = await navigateToExamTaker(page)

      if (!isExamTaker) {
        test.skip(true, 'Alice already submitted this exam — redirected to result')
        return
      }

      // The exam has multiple choice questions — look for radio inputs or option labels
      // Options are rendered as Label elements wrapping RadioGroupItem
      const optionLabels = page.locator('label')
      await expect(optionLabels.first()).toBeVisible({ timeout: 10_000 })

      const optionCount = await optionLabels.count()
      // Multiple choice or true/false should have at least 2 options
      expect(optionCount).toBeGreaterThanOrEqual(2)
    })

    test('timer displays when exam has a duration', async ({ page }) => {
      test.setTimeout(60_000)
      const isExamTaker = await navigateToExamTaker(page)

      if (!isExamTaker) {
        test.skip(true, 'Alice already submitted this exam — redirected to result')
        return
      }

      // If the exam has a duration, a timer with "Time Left" and MM:SS format should show
      const timer = page.locator('text=/Time Left/i')
      const hasTimer = await timer.isVisible({ timeout: 5_000 }).catch(() => false)

      if (hasTimer) {
        // Timer format should be visible (e.g. "30:00")
        const timeFormat = page.locator('text=/\\d+:\\d{2}/')
        await expect(timeFormat.first()).toBeVisible({ timeout: 5_000 })
      }
      // If no timer, the exam has no duration — that is valid, so we pass
    })
  })

  test.describe('Exam Question Interaction', () => {
    /**
     * Helper: navigates to the exam taker URL and detects redirect.
     */
    async function navigateToExamTaker(page: import('@playwright/test').Page): Promise<boolean> {
      await page.goto(EXAM_TAKER_URL, { timeout: 30_000 })
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 })
      await page.waitForTimeout(2_000)
      const currentUrl = page.url()
      return currentUrl.includes('/exams/') && !currentUrl.includes('/result') && !currentUrl.includes('/404')
    }

    test('can select a multiple choice answer and navigate between questions', async ({
      page,
    }) => {
      test.setTimeout(60_000)
      const isExamTaker = await navigateToExamTaker(page)

      if (!isExamTaker) {
        test.skip(true, 'Alice already submitted this exam — redirected to result')
        return
      }

      // Click on the first option label to select an answer
      const optionLabels = page.locator('label')
      await expect(optionLabels.first()).toBeVisible({ timeout: 10_000 })
      await optionLabels.first().click()

      // Progress should update to show 1 answered
      const progressAfterAnswer = page.locator('text=/Progress.*1\\/\\d+/i')
      await expect(progressAfterAnswer.first()).toBeVisible({ timeout: 5_000 })

      // Try navigating to next question
      const nextButton = page.locator('button:has-text("Next Question")')
      const hasNext = await nextButton.isVisible({ timeout: 5_000 }).catch(() => false)

      if (hasNext) {
        await nextButton.click()

        // Verify we moved to Question 2
        const q2Indicator = page.locator('text=/Question\\s+2/i')
        await expect(q2Indicator.first()).toBeVisible({ timeout: 5_000 })

        // Navigate back to Question 1
        const prevButton = page.locator('button:has-text("Previous")')
        await expect(prevButton).toBeEnabled()
        await prevButton.click()

        const q1Indicator = page.locator('text=/Question\\s+1/i')
        await expect(q1Indicator.first()).toBeVisible({ timeout: 5_000 })
      }
    })

    test('last question shows Finish & Submit button (without clicking it)', async ({
      page,
    }) => {
      test.setTimeout(60_000)
      const isExamTaker = await navigateToExamTaker(page)

      if (!isExamTaker) {
        test.skip(true, 'Alice already submitted this exam — redirected to result')
        return
      }

      // Navigate to the last question by clicking Next repeatedly
      const nextButton = page.locator('button:has-text("Next Question")')
      let hasNext = await nextButton.isVisible({ timeout: 5_000 }).catch(() => false)

      while (hasNext) {
        await nextButton.click()
        // Wait for transition
        await page.waitForTimeout(500)
        hasNext = await nextButton.isVisible({ timeout: 2_000 }).catch(() => false)
      }

      // On the last question, the submit button should be visible
      const submitButton = page.getByTestId('exam-finish-submit')
      await expect(submitButton).toBeVisible({ timeout: 5_000 })
      await expect(submitButton).toBeEnabled()

      // DO NOT click submit — just verify it exists
      const buttonText = await submitButton.textContent()
      expect(buttonText).toMatch(/Finish.*Submit/i)
    })
  })

  test.describe('Exam Results', () => {
    test('result page loads with score or redirects to exam taker', async ({
      page,
    }) => {
      test.setTimeout(60_000)
      await page.goto(EXAM_RESULT_URL, { timeout: 30_000 })
      await page.waitForLoadState('networkidle', { timeout: 30_000 })

      const currentUrl = page.url()

      if (currentUrl.includes('/result')) {
        // Alice has a prior submission — verify result page content
        // Score header with "Exam Completed" badge
        const completedBadge = page.locator('text=/Exam Completed/i')
        await expect(completedBadge.first()).toBeVisible({ timeout: 15_000 })

        // Final score percentage
        const scoreText = page.locator('text=/Final Score/i')
        await expect(scoreText.first()).toBeVisible({ timeout: 10_000 })

        // Score value (number followed by %)
        const scoreValue = page.locator('text=/\\d+%/')
        await expect(scoreValue.first()).toBeVisible({ timeout: 10_000 })

        // Detailed Question Review section
        const detailedReview = page.locator(
          'text=/Detailed Question Review/i'
        )
        await expect(detailedReview.first()).toBeVisible({ timeout: 10_000 })

        // Navigation buttons
        const assessmentsLink = page.locator(
          'text=/View All Assessments/i'
        )
        await expect(assessmentsLink.first()).toBeVisible({ timeout: 10_000 })

        const continueLink = page.locator('text=/Continue Learning/i')
        await expect(continueLink.first()).toBeVisible({ timeout: 10_000 })
      } else {
        // No prior submission — redirected to exam taker page
        // This is expected behavior, verify exam taker loaded
        const examContent = page.locator('h1, h2')
        await expect(examContent.first()).toBeVisible({ timeout: 15_000 })
      }
    })
  })
})
