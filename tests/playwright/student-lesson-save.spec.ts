import { test, expect } from '@playwright/test'
import { loginAsStudent } from './utils/auth'
import { BASE } from './utils/constants'

test('a failed lesson save remains retryable without success celebrations', async ({ page }, testInfo) => {
  await loginAsStudent(page)
  await page.goto(`${BASE}/en/dashboard/student/courses/1002/lessons/1003`)
  const toggle = page.getByTestId('lesson-complete-toggle')
  await expect(toggle).toBeVisible()
  // Keep this regression read-only: intercept the write rather than alter progress.
  await expect(toggle).not.toContainText('Completed')
  let writes = 0
  await page.route('**/rest/v1/lesson_completions*', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    writes++
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Save unavailable' }) })
  })
  await toggle.click()
  await expect(page.getByText('Failed to mark lesson as complete', { exact: true })).toBeVisible()
  await expect(toggle).toBeEnabled()
  // Let the toast finish entering before capturing readable visual evidence.
  await page.waitForTimeout(500)
  await page.screenshot({ path: testInfo.outputPath('failed-lesson-save.png'), fullPage: true })
  await expect(page.locator('[data-sonner-toast][data-type="success"]')).toHaveCount(0)
  await toggle.click()
  await expect.poll(() => writes).toBe(2)
  await expect(toggle).toBeEnabled()
})
