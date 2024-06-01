import { test } from '@playwright/test'

const url = process.env.NODE_ENV === 'production'
    ? 'https://lms-front-two.vercel.app/auth/login/'
    : 'http://localhost:3000/auth/login/'

test('has title', async ({ page }) => {
    await page.goto(url)
    await page.getByPlaceholder('you@example.com').click()
    await page.getByPlaceholder('you@example.com').fill('student@example.com')
    await page.getByPlaceholder('you@example.com').press('Tab')
    await page.getByPlaceholder('••••••••').fill('Testeopass12@')
    await page.getByRole('button', { name: 'Login' }).click()
    await page.getByRole('link', { name: 'View Lessons' }).click()
    await page.locator('div').filter({ hasText: /^1Introduction to PythonYour first Python lessonNot StartedStart$/ }).getByRole('link').click()
    await page.getByPlaceholder('Send a message').click()
    await page.getByPlaceholder('Send a message').fill('hola')
    await page.getByPlaceholder('Send a message').press('Enter')
})

test('get started link', async ({ page }) => {
    await page.goto(url)
    await page.getByPlaceholder('you@example.com').click()
    await page.getByPlaceholder('you@example.com').fill('teacher@example.com')
    await page.getByPlaceholder('you@example.com').press('Tab')
    await page.getByPlaceholder('••••••••').fill('Testeopass12@')
    await page.getByRole('button', { name: 'Login' }).click()
    await page.getByRole('link', { name: 'Courses' }).nth(1).click()
    await page.goto('http://localhost:3000/dashboard/teacher/courses')
    await page.getByRole('button', { name: 'Create a new course' }).click()
    await page.locator('input[name="title"]').fill('Title')
    await page.locator('input[name="title"]').press('Tab')
    await page.locator('input[name="description"]').fill('description')
    await page.getByLabel('Category ID').selectOption('10')
    await page.getByLabel('Product ID').selectOption('1')
    await page.getByLabel('Status').click()
    await page.getByLabel('Draft').click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('row', { name: '16 Title description draft 01' }).getByRole('button').click()
    await page.getByRole('link', { name: 'Ver detalles' }).click()
    await page.getByRole('link', { name: 'Create Lesson' }).click()
    await page.goto('http://localhost:3000/dashboard/teacher/courses/16/lessons')
})
