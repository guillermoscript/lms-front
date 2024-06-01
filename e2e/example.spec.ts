import { expect, test } from '@playwright/test'

test('has title', async ({ page }) => {
    await page.goto('https://lms-front-two.vercel.app/auth/login/')
    await page.getByPlaceholder('you@example.com').click()
    await page.getByPlaceholder('you@example.com').fill('student@example.com')
    await page.getByPlaceholder('you@example.com').press('Tab')
    await page.getByPlaceholder('••••••••').fill('Testeopass12@')
    await page.getByRole('button', { name: 'Login' }).click()
    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/Playwright/)
})

test('get started link', async ({ page }) => {
    await page.goto('https://lms-front-two.vercel.app/auth/login/')
    await page.getByPlaceholder('you@example.com').click()
    await page.getByPlaceholder('you@example.com').fill('teacher@example.com')
    await page.getByPlaceholder('you@example.com').press('Tab')
    await page.getByPlaceholder('••••••••').fill('Testeopass12@')
    await page.getByRole('button', { name: 'Login' }).click()
})
