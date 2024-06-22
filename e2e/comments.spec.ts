import { test } from '@playwright/test'

import { loginStudent } from './components/login-student'
import { url } from './utils/url'

test('comments tests', async ({ page }) => {
    await page.goto(url)

    await loginStudent(page)
    await page.getByRole('link', { name: 'View Lessons' }).click()
    await page.locator('div').filter({ hasText: /^1Introduction to PythonYour first Python lesson!CompletedReview$/ }).getByRole('link').click()
    await page.getByRole('button', { name: 'View Replies' }).last().click()
    await page.getByRole('button', { name: 'Reply' }).last().click()
    await page.getByText('test e2eBlock').getByLabel('editable markdown').getByRole('paragraph').click()
    await page.keyboard.type('test e2e')
    await page.locator('.p-4 > .ml-1 > div').getByRole('button', { name: 'Submit Comment' }).click()
})
