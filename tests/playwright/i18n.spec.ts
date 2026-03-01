import { test, expect } from '@playwright/test'
import { BASE } from './utils/constants'

/**
 * P2 — Internationalization Tests
 * Verifies locale routing and language switching.
 */

test.describe('Internationalization', () => {
  test('default route includes /en locale', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/en/)
  })

  test('/es locale route loads correctly', async ({ page }) => {
    await page.goto(`${BASE}/es`)
    await expect(page).toHaveURL(/\/es/)
  })

  test('login page renders in Spanish', async ({ page }) => {
    await page.goto(`${BASE}/es/auth/login`)
    await expect(page.getByTestId('login-title')).toBeVisible()
    await expect(page.getByTestId('login-email')).toBeVisible()
    // The page should contain Spanish text
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/Iniciar|Correo|Contraseña/i)
  })

  test('dashboard respects locale from URL', async ({ page }) => {
    await page.goto(`${BASE}/es/auth/login`)
    await page.getByTestId('login-email').fill('student@e2etest.com')
    await page.getByTestId('login-password').fill('password123')
    await page.getByTestId('login-submit').click()
    await page.waitForURL('**/dashboard/**', { timeout: 20_000 })
    // URL should preserve /es/ locale
    expect(page.url()).toContain('/es/')
  })
})
