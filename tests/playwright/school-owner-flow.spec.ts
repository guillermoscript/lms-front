import { test, expect, type Page } from '@playwright/test'
import { loginAsTeacher } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'
import { getServiceRoleClient } from './utils/seed-state'

/**
 * P0 — School Owner Core Flows
 *
 * Tests the critical path for a school owner (admin):
 *   1. Login → dashboard accessible
 *   2. Create course → lands on the first-lesson editor (#675), and the
 *      course detail page renders the title (not "Course not found")
 *   3. Create lesson in that course
 *   4. Create exam in that course
 *   5. Create exercise in that course
 *   6. Course settings accessible
 *   7. Courses list shows the new course
 *
 * Uses owner@e2etest.com (admin role on default tenant).
 */

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const CREATED_TITLES = [
  'E2E Test Course',
  'Lesson Test Course',
  'Exam Test Course',
  'Exercise Test Course',
  'Settings Test Course',
  'Listed Course',
]

// Creating a course lands on its first-lesson editor, not the course overview
// (#675): the course has nothing a student can open until a lesson exists.
const NEW_COURSE_LANDING = /\/dashboard\/teacher\/courses\/(\d+)\/lessons\/new\?from=new-course/

/** Fill the quick-create form, submit, and return the new course id from the landing URL. */
async function createCourse(page: Page, title: string): Promise<string> {
  await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`)
  await page.getByLabel(/title/i).first().fill(title)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(NEW_COURSE_LANDING, { timeout: 15_000 })
  const id = page.url().match(NEW_COURSE_LANDING)?.[1]
  expect(id, `course id in ${page.url()}`).toBeTruthy()
  return id!
}

test.describe('School Owner Core Flows', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  // Default School is on the free plan (max_courses: 5) and the seed already
  // holds 2 courses. Each test here creates one more, and the plan-limit
  // trigger (#658) refuses the 6th — so on a fresh database tests 5–7 stalled
  // on the create form. Remove what each test made before the next one runs.
  test.afterEach(async () => {
    const admin = getServiceRoleClient()
    await admin.from('courses').delete().eq('tenant_id', DEFAULT_TENANT).in('title', CREATED_TITLES)
  })

  test('1. admin dashboard loads', async ({ page }) => {
    await page.goto(`${BASE}/${LOCALE}/dashboard/admin`)
    // Should not redirect away or show error
    await expect(page).toHaveURL(/\/dashboard\/admin/)
  })

  test('2. create course → lands on first lesson, detail page renders', async ({ page }) => {
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`)
    await page.getByLabel(/title/i).first().fill('E2E Test Course')
    await page.getByLabel(/description/i).first().fill('Created by E2E test')

    // Submit → first-lesson editor for the new course (#675)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(NEW_COURSE_LANDING, { timeout: 15_000 })
    const courseId = page.url().match(NEW_COURSE_LANDING)?.[1] || ''
    expect(courseId).toBeTruthy()
    await expect(page.getByTestId('first-lesson-hint')).toContainText('E2E Test Course', { timeout: 10_000 })

    // The course detail page must exist and show the title (not "Course not found")
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${courseId}`)
    await expect(page.getByRole('heading', { name: 'E2E Test Course' })).toBeVisible({ timeout: 10_000 })

    // "Course not found" should NOT be present
    await expect(page.getByText('Course not found')).not.toBeVisible()
    await expect(page.getByText("doesn't exist")).not.toBeVisible()
  })

  test('3. create lesson in course', async ({ page }) => {
    // First create a course to get an ID
    const cId = await createCourse(page, 'Lesson Test Course')

    // Navigate to add lesson
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${cId}/lessons/new`)

    // Fill lesson form — use placeholder-based selector for title
    await page.getByPlaceholder(/introduction to/i).fill('E2E Lesson One')
    const summaryField = page.getByPlaceholder(/one-line overview/i)
    if (await summaryField.isVisible()) {
      await summaryField.fill('A test lesson created by E2E')
    }

    // Save draft
    await page.getByRole('button', { name: /save draft/i }).click()

    // Wait for save confirmation (toast or redirect)
    await page.waitForTimeout(3000)

    // Navigate back to course — lesson should appear
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${cId}`)
    await expect(page.getByText('E2E Lesson One')).toBeVisible({ timeout: 10_000 })
  })

  test('4. create exam in course', async ({ page }) => {
    // Create course
    const cId = await createCourse(page, 'Exam Test Course')

    // Navigate to add exam
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${cId}/exams/new`)

    // Fill exam form
    await page.getByLabel(/exam title/i).fill('E2E Exam One')
    const descField = page.getByLabel(/description/i)
    if (await descField.isVisible()) {
      await descField.fill('Test exam')
    }

    // Save
    await page.getByRole('button', { name: /save draft/i }).click()

    // Should redirect back to course
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+$/, { timeout: 15_000 })

    // Click Exams tab and verify
    await page.getByRole('tab', { name: /exams/i }).click()
    await expect(page.getByText('E2E Exam One')).toBeVisible({ timeout: 10_000 })
  })

  test('5. create exercise in course', async ({ page }) => {
    // Create course
    const cId = await createCourse(page, 'Exercise Test Course')

    // Navigate to add exercise
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${cId}/exercises/new`)

    // Fill exercise form — title uses placeholder
    await page.getByPlaceholder(/build a todo/i).fill('E2E Exercise One')
    const descField = page.getByPlaceholder(/what will students/i)
    if (await descField.isVisible()) {
      await descField.fill('Test exercise')
    }

    // Save
    await page.getByRole('button', { name: /save draft/i }).click()
    await page.waitForTimeout(3000)

    // Navigate back and verify
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${cId}`)
    await page.getByRole('tab', { name: /exercises/i }).click()
    await expect(page.getByText('E2E Exercise One')).toBeVisible({ timeout: 10_000 })
  })

  test('6. course settings page accessible', async ({ page }) => {
    // Create course
    const cId = await createCourse(page, 'Settings Test Course')

    // Navigate to settings
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${cId}/settings`)

    // Should load without error
    await expect(page.getByText('Course not found')).not.toBeVisible()
    await expect(page.getByText("doesn't exist")).not.toBeVisible()
  })

  test('7. my courses list shows created courses', async ({ page }) => {
    // Create a course first
    await createCourse(page, 'Listed Course')

    // Navigate to courses list
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses`)

    // Should show the course
    await expect(page.getByText('Listed Course')).toBeVisible({ timeout: 10_000 })
  })
})
