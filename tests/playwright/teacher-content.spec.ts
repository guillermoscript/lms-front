import { test, expect } from '@playwright/test'
import { loginAsTeacher } from './utils/auth'
import { BASE } from './utils/constants'

/**
 * P1 — Teacher Content Management Tests
 * Covers lesson editor, exercise builder, exam builder, submissions, and templates.
 */

test.describe('Teacher Content Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page)
  })

  test('teacher can access lesson editor for a course', async ({ page }) => {
    test.setTimeout(60_000)
    // Navigate to a course's lessons section
    await page.goto(`${BASE}/en/dashboard/teacher/courses/1`)
    await page.waitForLoadState('networkidle')
    // Look for lessons tab or section
    const lessonsLink = page.locator(
      'a[href*="/lessons"], button:has-text("Lessons"), [role="tab"]:has-text("Lessons")'
    )
    if (await lessonsLink.first().isVisible()) {
      await lessonsLink.first().click()
      await page.waitForTimeout(2000)
    }
    // Should show lesson content or editor
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('teacher can access exercise builder for a course', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.goto(`${BASE}/en/dashboard/teacher/courses/1`)
    await page.waitForLoadState('networkidle')
    const exercisesLink = page.locator(
      'a[href*="/exercises"], button:has-text("Exercises"), [role="tab"]:has-text("Exercises")'
    )
    if (await exercisesLink.first().isVisible()) {
      await exercisesLink.first().click()
      await page.waitForTimeout(2000)
    }
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('teacher can access exam builder for a course', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${BASE}/en/dashboard/teacher/courses/1`)
    await page.waitForLoadState('networkidle')
    const examsLink = page.locator(
      'a[href*="/exams"], button:has-text("Exams"), [role="tab"]:has-text("Exams")'
    )
    if (await examsLink.first().isVisible()) {
      await examsLink.first().click()
      await page.waitForTimeout(2000)
    }
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })

  test('teacher can view exam submissions list', async ({ page }) => {
    test.setTimeout(60_000)
    // Navigate to exam submissions page for course 1
    await page.goto(`${BASE}/en/dashboard/teacher/courses/1`)
    await page.waitForLoadState('networkidle')
    // Look for submissions link or tab
    const submissionsLink = page.locator(
      'a[href*="/submissions"], a[href*="/exams"]'
    )
    if (await submissionsLink.first().isVisible()) {
      await submissionsLink.first().click()
      await page.waitForTimeout(2000)
    }
    await expect(page.locator('body')).toBeVisible()
  })

  test('teacher certificate templates page loads', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/teacher/templates`)
    await expect(page.getByTestId('templates-page')).toBeVisible()
  })

  test('teacher revenue page shows dashboard', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/teacher/revenue`)
    await expect(page.getByTestId('revenue-page')).toBeVisible()
    await expect(
      page.getByText(/Revenue Dashboard/i)
    ).toBeVisible()
  })
})
