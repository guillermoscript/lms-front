import { test, expect } from '@playwright/test'
import { loginAsStudent } from './utils/auth'
import { BASE } from './utils/constants'

const screens = ['profile', 'courses', 'browse', 'progress', 'certificates', 'billing', 'reviews', 'courses/1001/exercises', 'courses/1001/exams']
test('student screens render and subscription management is reachable', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await loginAsStudent(page)
  for (const screen of screens) {
    const response = await page.goto(`${BASE}/en/dashboard/student/${screen}`)
    expect(response?.status(), screen).toBe(200)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`${screen.replaceAll('/', '-')}.png`), fullPage: true })
    if (screen === 'profile') {
      const manage = page.getByRole('link', { name: 'Manage Subscription', exact: true })
      if (await page.getByText('Manage Subscription', { exact: true }).count()) {
        await expect(manage).toHaveAttribute('href', /\/dashboard\/student\/billing$/)
        await manage.click()
        await expect(page).toHaveURL(/\/dashboard\/student\/billing$/)
      }
    }
  }
  expect(pageErrors).toEqual([])
})
