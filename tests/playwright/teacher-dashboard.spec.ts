import { test, expect } from '@playwright/test'
import { loginAsTeacher } from './utils/auth'
import { BASE } from './utils/constants'

/**
 * Teacher Dashboard smoke test — verifies layout, navigation, and basic flow.
 */

test.describe('Teacher Dashboard', () => {
  test('full smoke: loads, layout, console errors', async ({ page }) => {
    await loginAsTeacher(page)

    // Collect console errors
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Dashboard should render
    await expect(page.getByTestId('teacher-dashboard')).toBeVisible()
    await expect(page.getByTestId('teacher-welcome')).toBeVisible()

    // Navigate to courses list
    await page.goto(`${BASE}/en/dashboard/teacher/courses`)
    await expect(page.getByTestId('teacher-courses-list')).toBeVisible()

    // Navigate to create course form
    await page.goto(`${BASE}/en/dashboard/teacher/courses/new`)
    await expect(page.getByLabel(/title/i)).toBeVisible()
    await expect(page.getByLabel(/description/i)).toBeVisible()

    // Navigate to revenue
    await page.goto(`${BASE}/en/dashboard/teacher/revenue`)
    await expect(page.getByTestId('revenue-page')).toBeVisible()

    // Navigate to templates
    await page.goto(`${BASE}/en/dashboard/teacher/templates`)
    await expect(page.getByTestId('templates-page')).toBeVisible()

    // Fail if console errors were captured
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([])
  })
})
