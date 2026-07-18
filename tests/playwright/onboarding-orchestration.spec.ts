import { expect, test } from '@playwright/test'
import { TENANT_BASE } from './utils/constants'
import { loginAsAdmin } from './utils/auth'

test.describe('onboarding orchestration', () => {
  test('keeps tours on demand and promotes one admin next action', async ({ page }) => {
    await loginAsAdmin(page)
    await page.evaluate(() => localStorage.removeItem('tours-disabled'))
    await page.goto(`${TENANT_BASE}/en/dashboard/admin`)

    await expect(page.getByTestId('admin-dashboard')).toBeVisible()
    await page.waitForTimeout(1_000)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('onboarding-next-step')).toHaveCount(1)
    await expect(page.getByTestId('onboarding-milestone')).toBeVisible()
    await expect(page.getByText(/more steps?$/)).toBeVisible()

    await page.getByRole('button', { name: 'Replay tour' }).click()
    await expect(page.getByRole('dialog', { name: 'Getting Started Checklist' })).toBeVisible()
  })

  test('renders the next-action hierarchy in Spanish', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/es/dashboard/admin`)

    await expect(page.getByText('Haz esto ahora', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Repetir recorrido' })).toBeVisible()
  })
})
