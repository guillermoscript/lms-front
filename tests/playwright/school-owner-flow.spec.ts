import { test, expect } from '@playwright/test'
import { loginAsTeacher } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'

/**
 * P0 — School Owner Core Flows
 *
 * Tests the critical path for a school owner (admin):
 *   1. Login → dashboard accessible
 *   2. Create course → redirected to course detail (not "Course not found")
 *   3. Create lesson in that course
 *   4. Create exam in that course
 *   5. Create exercise in that course
 *   6. Course settings accessible
 *   7. Courses list shows the new course
 *
 * Uses owner@e2etest.com (admin role on default tenant).
 */

test.describe('School Owner Core Flows', () => {
  let courseId: string

  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  test('1. admin dashboard loads', async ({ page }) => {
    await page.goto(`${BASE}/${LOCALE}/dashboard/admin`)
    // Should not redirect away or show error
    await expect(page).toHaveURL(/\/dashboard\/admin/)
  })

  test('2. create course → lands on course detail page', async ({ page }) => {
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`)
    await page.getByLabel(/title/i).first().fill('E2E Test Course')
    await page.getByLabel(/description/i).first().fill('Created by E2E test')

    // Submit
    await page.locator('button[type="submit"]').click()

    // Should redirect to the course detail page (not "Course not found")
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 15_000 })
    courseId = page.url().match(/\/courses\/(\d+)/)?.[1] || ''
    expect(courseId).toBeTruthy()

    // The course title should be visible
    await expect(page.getByRole('heading', { name: 'E2E Test Course' })).toBeVisible({ timeout: 10_000 })

    // "Course not found" should NOT be present
    await expect(page.getByText('Course not found')).not.toBeVisible()
    await expect(page.getByText("doesn't exist")).not.toBeVisible()
  })

  test('3. create lesson in course', async ({ page }) => {
    // First create a course to get an ID
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`)
    await page.getByLabel(/title/i).first().fill('Lesson Test Course')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 15_000 })
    const cId = page.url().match(/\/courses\/(\d+)/)?.[1]

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
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`)
    await page.getByLabel(/title/i).first().fill('Exam Test Course')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 15_000 })
    const cId = page.url().match(/\/courses\/(\d+)/)?.[1]

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
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`)
    await page.getByLabel(/title/i).first().fill('Exercise Test Course')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 15_000 })
    const cId = page.url().match(/\/courses\/(\d+)/)?.[1]

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
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`)
    await page.getByLabel(/title/i).first().fill('Settings Test Course')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 15_000 })
    const cId = page.url().match(/\/courses\/(\d+)/)?.[1]

    // Navigate to settings
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/${cId}/settings`)

    // Should load without error
    await expect(page.getByText('Course not found')).not.toBeVisible()
    await expect(page.getByText("doesn't exist")).not.toBeVisible()
  })

  test('7. my courses list shows created courses', async ({ page }) => {
    // Create a course first
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`)
    await page.getByLabel(/title/i).first().fill('Listed Course')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 15_000 })

    // Navigate to courses list
    await page.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses`)

    // Should show the course
    await expect(page.getByText('Listed Course')).toBeVisible({ timeout: 10_000 })
  })
})
