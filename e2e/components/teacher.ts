import { Page } from '@playwright/test'

import { url } from '../utils/url'

export const teacher = async (page: Page) => {
    await page.goto(url)
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await page.getByRole('menuitem', { name: 'Dark' }).click()
    await page.getByPlaceholder('you@example.com').click()
    await page.getByPlaceholder('you@example.com').fill('teacher@example.com')
    await page.getByPlaceholder('you@example.com').press('Tab')
    await page.getByPlaceholder('••••••••').fill('Testeopass12@')
    await page.getByRole('button', { name: 'Login' }).click()
    await page.getByRole('link', { name: 'Courses' }).nth(1).click()
    await page.goto('http://localhost:3000/dashboard/teacher/courses')
    await page.getByRole('button', { name: 'Create a new course' }).click()
    const title = 'e2e'
    await page.locator('input[name="title"]').fill(title)
    await page.locator('input[name="title"]').press('Tab')
    await page.locator('input[name="description"]').fill('description')
    await page.getByLabel('Category ID').selectOption('10')
    await page.getByLabel('Product ID').selectOption('1')
    await page.getByLabel('Status').click()
    await page.getByLabel('Draft').click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('row', { name: title }).last().getByRole('button').click()
    await page.getByLabel('Open menu').locator('div').click()
    await page.getByRole('link', { name: 'Ver detalles' }).click()
    await page.getByRole('link', { name: 'Create Lesson' }).click()
    await page.locator('input[name="title"]').click()
    await page.locator('input[name="title"]').fill('Title lesson')
    await page.getByRole('spinbutton').click()
    await page.getByRole('spinbutton').fill('4')
    await page.locator('input[name="video_url"]').click()
    await page.getByRole('textbox').nth(3).click()
    await page.getByRole('textbox').nth(4).click()
    await page.locator('input[name="video_url"]').click()
    await page.locator('input[name="video_url"]').fill('https://www.youtube.com/watch?v=MkbtqvTA22w')
    await page.locator('[contenteditable="true"]').first().fill('abc')
    await page.locator('[contenteditable="true"]').nth(1).fill('abc 2')
    await page.getByRole('button', { name: 'Submit' }).click()
    //
    await page.getByRole('button', { name: 'Avatar Toggle user menu' }).click()
    await page.getByRole('button', { name: 'Logout' }).click()
}