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
    await page.pause()
    await page.getByText('test e2eBlock').locator('form').first().fill('test e2e')
    // await page.locator('.comment-editor > p').last().click()
    // await page.locator('form').filter({ hasText: 'ParagraphParagraphQuoteHeading 1Heading 2Heading 3Heading 4Heading 5Heading' }).getByLabel('editable markdown').fill('test e2e')
    // await page.getByRole('button', { name: 'Submit Comment' }).first().click()
    // await expect(page.getByLabel('View Replies (5)')).toContainText('test e2e')
    // await page.getByLabel('View Replies (5)').getByRole('button', { name: 'Reply (0)' }).nth(3).click()
    // await page.getByLabel('View Replies (5)').getByLabel('editable markdown').getByRole('paragraph').click()
    // await page.getByLabel('View Replies (5)').getByLabel('editable markdown').fill('test e2e 2')
    // await page.getByLabel('View Replies (5)').getByRole('button', { name: 'Submit Comment' }).click()
    // await page.getByRole('button', { name: 'View Replies' }).last().click()
    // await expect(page.getByLabel('View Replies (5)').getByRole('region')).toContainText('test e2e 2')
    // await page.locator('header').getByRole('button', { name: '1' }).click()
    // await page.getByRole('link', { name: 'View all notifications' }).click()
    // await page.getByRole('link', { name: 'View' }).click()
})
