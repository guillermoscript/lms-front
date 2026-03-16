import { test, expect } from '@playwright/test'
import { loginAsTeacher } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'

/**
 * P1 — Teacher Content CRUD Tests
 *
 * Validates the refactored compound-component builders:
 *   - Course detail page (tabs, lesson list, exercise list, exams, certificates)
 *   - Lesson editor (existing + new)
 *   - Exercise builder (new)
 *   - Exam builder (new)
 *   - Certificate template settings
 *   - Revenue dashboard & templates page
 *
 * Spec: tests/playwright/specs/teacher-content-crud.spec.md
 *
 * Uses seeded data:
 *   - Course 1001 "Introduction to Testing" (2 lessons: 1001, 1002)
 *   - Teacher: owner@e2etest.com / password123
 */

const COURSE_URL = `${BASE}/${LOCALE}/dashboard/teacher/courses/1001`

test.describe('Teacher Content — Course Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
    // Teacher account has admin role — lands on /dashboard/admin; navigate explicitly
  })

  test('course detail page loads with correct header', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(COURSE_URL)

    // Course title
    await expect(page.locator('h1')).toContainText('Introduction to Testing')

    // Status badge (draft or published)
    const badge = page.locator('header').locator('.inline-flex, [class*="badge"]').first()
    await expect(badge).toBeVisible()
  })

  test('course detail page shows all five tabs', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(COURSE_URL)

    const tabsList = page.locator('[data-tour="course-tabs"]')
    await expect(tabsList).toBeVisible()

    // Verify all tab triggers exist
    const tabs = ['Lessons', 'Exercises', 'Exams', 'Students', 'Certificates']
    for (const tabName of tabs) {
      await expect(
        page.locator('[role="tab"]').filter({ hasText: tabName })
      ).toBeVisible()
    }
  })

  test('lessons tab shows lesson cards with correct count', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(COURSE_URL)

    // Lessons tab is selected by default
    const lessonsTab = page.getByRole('tab', { name: /Lessons/i })
    await expect(lessonsTab).toBeVisible({ timeout: 10_000 })
    await expect(lessonsTab).toContainText('2')

    // Tab panel shows lesson links
    const tabPanel = page.getByRole('tabpanel')
    await expect(tabPanel).toBeVisible({ timeout: 10_000 })

    // Two lesson cards
    await expect(tabPanel.locator('a[href*="/lessons/1001"]')).toBeVisible()
    await expect(tabPanel.locator('a[href*="/lessons/1002"]')).toBeVisible()

    // "Add Lesson" button present
    await expect(tabPanel.locator('a[href*="/lessons/new"]')).toBeVisible()
  })

  test('exercises tab renders with add button', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(COURSE_URL)

    // Click the Exercises tab
    const exercisesTab = page.getByRole('tab', { name: /Exercises/i })
    await expect(exercisesTab).toBeVisible({ timeout: 10_000 })
    await exercisesTab.click()

    // Wait for "Add Exercise" link to appear in the tab panel
    await expect(
      page.locator('a[href*="/exercises/new"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('exams tab renders with add button', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(COURSE_URL)

    // Click the Exams tab
    const examsTab = page.getByRole('tab', { name: /Exams/i })
    await expect(examsTab).toBeVisible({ timeout: 10_000 })
    await examsTab.click()

    // Wait for "Add Exam" link to appear
    await expect(
      page.locator('a[href*="/exams/new"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('certificates tab renders with settings link', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(COURSE_URL)

    // Click the Certificates tab
    const certsTab = page.getByRole('tab', { name: /Certificates/i })
    await expect(certsTab).toBeVisible({ timeout: 10_000 })
    await certsTab.click()

    // Wait for certificate settings link
    await expect(
      page.locator('a[href*="/certificates/settings"]').first()
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Teacher Content — Lesson Editor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  test('existing lesson editor loads with pre-filled data', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${COURSE_URL}/lessons/1001`)

    // Wait for dynamic import to load
    const header = page.locator('[data-tour="lesson-header"]')
    await expect(header).toBeVisible({ timeout: 15_000 })

    // Breadcrumb shows course title
    await expect(header).toContainText('Introduction to Testing')

    // Shows "Edit" (not "Create") since this is an existing lesson
    await expect(header).toContainText(/edit/i)

    // Step navigation with 4 steps (desktop)
    const stepsNav = page.locator('[data-tour="lesson-steps"]')
    await expect(stepsNav).toBeVisible()

    // All 4 step buttons present
    const stepButtons = stepsNav.locator('button')
    await expect(stepButtons).toHaveCount(4)

    // Title input is pre-filled
    const titleInput = page.locator('input[type="text"]').first()
    await expect(titleInput).toHaveValue('What is Software Testing?')

    // Description textarea
    await expect(page.locator('#description')).toBeVisible()

    // Video URL input
    await expect(page.locator('#video_url')).toBeVisible()

    // Sequence input
    await expect(page.locator('#sequence')).toBeVisible()
    await expect(page.locator('#sequence')).toHaveValue('1')

    // Preview toggle button
    await expect(page.locator('[data-tour="lesson-preview"]')).toBeVisible()
  })

  test('lesson editor step navigation works', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${COURSE_URL}/lessons/1001`)

    const stepsNav = page.locator('[data-tour="lesson-steps"]')
    await expect(stepsNav).toBeVisible({ timeout: 15_000 })

    const stepButtons = stepsNav.locator('button')

    // Click "Content" step (2nd)
    await stepButtons.nth(1).click()
    await page.waitForTimeout(500)

    // Content step shows visual/MDX editor toggle
    const editorModeToggle = page.locator('[data-tour="lesson-editor-mode"]')
    await expect(editorModeToggle).toBeVisible()

    // Click "Resources" step (3rd)
    await stepButtons.nth(2).click()
    await page.waitForTimeout(500)

    // Resources step shows the resource manager (since this is an existing lesson)
    // Just verify we navigated away from content — editor mode toggle is gone
    await expect(editorModeToggle).not.toBeVisible()

    // Click "AI Task" step (4th)
    await stepButtons.nth(3).click()
    await page.waitForTimeout(500)

    // Verify we can navigate back to Details (1st)
    await stepButtons.nth(0).click()
    await page.waitForTimeout(500)

    // Title input should be visible again on details step
    const titleInput = page.locator('input[type="text"]').first()
    await expect(titleInput).toHaveValue('What is Software Testing?')
  })

  test('new lesson form renders empty fields', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${COURSE_URL}/lessons/new`)

    const header = page.locator('[data-tour="lesson-header"]')
    await expect(header).toBeVisible({ timeout: 15_000 })

    // Shows "New" (not "Edit") since this is a new lesson
    await expect(header).toContainText(/new/i)

    // Breadcrumb shows course title
    await expect(header).toContainText('Introduction to Testing')

    // Title input is empty
    const titleInput = page.locator('input[type="text"]').first()
    await expect(titleInput).toHaveValue('')

    // Sequence should be 3 (next after existing 2 lessons)
    const sequenceInput = page.locator('#sequence')
    await expect(sequenceInput).toHaveValue('3')

    // Description is empty
    await expect(page.locator('#description')).toHaveValue('')
  })
})

test.describe('Teacher Content — Exercise Builder', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  test('new exercise form renders with all fields', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${COURSE_URL}/exercises/new`)

    // Wait for dynamic import to resolve
    await page.waitForLoadState('networkidle')

    // Breadcrumb shows course title
    await expect(page.getByText('Introduction to Testing')).toBeVisible({ timeout: 15_000 })

    // Step navigation: 2 steps (Details, AI Evaluation) — Audio Config only for audio types
    const stepNav = page.getByRole('navigation')
    await expect(stepNav).toBeVisible()
    await expect(page.getByRole('button', { name: /details/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /ai evaluation/i })).toBeVisible()

    // Title input is empty
    const titleInput = page.getByRole('textbox').first()
    await expect(titleInput).toHaveValue('')

    // Description textarea
    await expect(page.getByRole('textbox', { name: /description/i })).toBeVisible()

    // Difficulty level buttons (easy, medium, hard)
    for (const level of ['Easy', 'Medium', 'Hard']) {
      await expect(
        page.getByRole('button', { name: new RegExp(level, 'i') })
      ).toBeVisible()
    }

    // Time limit spinbutton
    await expect(page.getByRole('spinbutton').first()).toBeVisible()

    // Save Draft button (disabled since title is empty)
    const saveDraftBtn = page.getByRole('button', { name: /save draft/i })
    await expect(saveDraftBtn).toBeVisible()
    await expect(saveDraftBtn).toBeDisabled()

    // Publish button (disabled since title is empty)
    const publishBtn = page.getByRole('button', { name: /publish/i })
    await expect(publishBtn).toBeVisible()
    await expect(publishBtn).toBeDisabled()
  })

  test('exercise builder step navigation works', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${COURSE_URL}/exercises/new`)
    await page.waitForLoadState('networkidle')

    // Wait for component load
    const descInput = page.getByRole('textbox', { name: /description/i })
    await expect(descInput).toBeVisible({ timeout: 15_000 })

    // Click AI Evaluation step (2nd)
    await page.getByRole('button', { name: /ai evaluation/i }).click()
    await page.waitForTimeout(500)

    // Description should no longer be visible (it's on details step)
    await expect(descInput).not.toBeVisible()

    // Navigate back to Details (1st)
    await page.getByRole('button', { name: /details/i }).click()
    await page.waitForTimeout(500)

    // Description visible again
    await expect(descInput).toBeVisible()
  })
})

test.describe('Teacher Content — Exam Builder', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  test('new exam form renders with all fields and question buttons', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${COURSE_URL}/exams/new`)

    // Wait for dynamic import
    await page.waitForLoadState('networkidle')

    // Breadcrumb shows course + "New Exam"
    await expect(page.getByText('Introduction to Testing')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('New Exam')).toBeVisible()

    // Exam Details Card fields
    const titleInput = page.getByRole('textbox', { name: /exam title/i })
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toHaveValue('')

    const descInput = page.getByRole('textbox', { name: /description/i })
    await expect(descInput).toBeVisible()

    const durationInput = page.getByRole('spinbutton', { name: /time limit/i })
    await expect(durationInput).toBeVisible()

    const sequenceInput = page.getByRole('spinbutton', { name: /display order/i })
    await expect(sequenceInput).toBeVisible()

    // Questions section shows count of 0
    await expect(page.getByRole('heading', { name: /Questions \(0\)/i })).toBeVisible()

    // Add question buttons
    await expect(
      page.getByRole('button', { name: /multiple choice/i })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /true.*false/i })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /free text/i })
    ).toBeVisible()
  })

  test('exam builder add question buttons increment count', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${COURSE_URL}/exams/new`)
    await page.waitForLoadState('networkidle')

    // Wait for component
    await expect(page.getByRole('textbox', { name: /exam title/i })).toBeVisible({ timeout: 15_000 })

    // Initial count is 0
    await expect(page.getByRole('heading', { name: /Questions \(0\)/i })).toBeVisible()

    // Click "Add Multiple Choice" — should bump to 1
    await page.getByRole('button', { name: /multiple choice/i }).click()
    await expect(page.getByRole('heading', { name: /Questions \(1\)/i })).toBeVisible()

    // Click "Add True/False" — should bump to 2
    await page.getByRole('button', { name: /true.*false/i }).click()
    await expect(page.getByRole('heading', { name: /Questions \(2\)/i })).toBeVisible()
  })
})

test.describe('Teacher Content — Certificate Template', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  test('certificate settings page loads with form sections', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${COURSE_URL}/certificates/settings`)
    await page.waitForLoadState('networkidle')

    // Breadcrumb
    await expect(page.getByText('Introduction to Testing')).toBeVisible({ timeout: 15_000 })

    // Certificate Info section fields
    await expect(page.locator('#template_name')).toBeVisible()
    await expect(page.locator('#description')).toBeVisible()
    await expect(page.locator('#issuance_criteria')).toBeVisible()

    // Issuer Details section
    await expect(page.locator('#issuer_name')).toBeVisible()
    await expect(page.locator('#issuer_url')).toBeVisible()

    // Submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    // Cancel button
    const cancelBtn = page.locator('form button[type="button"]').first()
    await expect(cancelBtn).toBeVisible()
  })
})

test.describe('Teacher Content — Revenue & Templates Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  test('revenue dashboard loads', async ({ page }) => {
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/revenue`)
    await expect(page.getByTestId('revenue-page')).toBeVisible()
    // Use h1 to avoid matching multiple "revenue" elements on the page
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('templates page loads', async ({ page }) => {
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/templates`)
    await expect(page.getByTestId('templates-page')).toBeVisible()
  })
})
