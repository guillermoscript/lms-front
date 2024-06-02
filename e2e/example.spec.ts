import { test } from '@playwright/test'

test.describe('Login', () => {
    const url = process.env.NODE_ENV === 'production'
        ? 'https://lms-front-two.vercel.app/auth/login/'
        : 'http://localhost:3000/auth/login/'

    test.beforeAll(async ({ page }) => {
        console.log('beforeAll')
    })

    test('teacher', async ({ page }) => {
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
        await page.getByLabel('Block type').click()
        await page.locator('html').click()
        await page.locator('form').filter({ hasText: 'Block' }).getByRole('textbox').click()
        await page.locator('form').filter({ hasText: 'ParagraphQuoteHeading' }).getByRole('textbox').fill('Comentario de prueba')
        await page.locator('form').filter({ hasText: 'ParagraphQuoteHeading' }).getByRole('textbox').press('ControlOrMeta+a')
        await page.locator('form').filter({ hasText: 'ParagraphParagraphQuoteHeading 1Heading 2Heading 3Heading 4Heading 5Heading' }).getByRole('textbox').fill('e2e')
        await page.getByRole('button', { name: 'Submit Comment' }).click()
        await page.getByRole('button', { name: 'Toggle theme' }).click()
        await page.locator('html').click()
        await page.locator('header form div').click({
            button: 'middle'
        })
        await page.getByRole('button', { name: 'Avatar Toggle user menu' }).click()
        await page.getByRole('button', { name: 'Logout' }).click()

        await page.getByPlaceholder('you@example.com').click()
        await page.getByPlaceholder('you@example.com').press('ControlOrMeta+a')
        await page.getByPlaceholder('you@example.com').fill('Testeopass12@')
        await page.getByPlaceholder('you@example.com').press('ControlOrMeta+z')
        await page.getByPlaceholder('you@example.com').fill('teacher@example.com')
        await page.getByPlaceholder('••••••••').click()
        await page.getByPlaceholder('••••••••').fill('Testeopass12@')
        await page.getByRole('button', { name: 'Login' }).click()
        await page.getByRole('link', { name: 'Courses' }).nth(1).click()
        await page.getByRole('row', { name: '22 Title description draft 01' }).getByRole('button').click()
        await page.getByRole('link', { name: 'Ver detalles' }).click()
        await page.getByRole('tab', { name: 'Tests' }).click()
        await page.getByRole('link', { name: 'Create Test' }).click()
        await page.locator('input[name="testName"]').click()
        await page.locator('input[name="testName"]').fill('test')
        await page.locator('input[name="testDescription"]').click()
        await page.locator('input[name="testDescription"]').fill('desc')
        await page.locator('input[name="sequence"]').click()
        await page.locator('input[name="sequence"]').fill('0')
        await page.locator('input[name="sequence"]').press('ArrowUp')
        await page.locator('input[name="course"]').click()
        await page.locator('input[name="course"]').press('ArrowUp')
        await page.locator('input[name="exam_date"]').fill('2024-06-01')
        await page.locator('input[name="course"]').click()
        await page.locator('input[name="course"]').fill('11')
        await page.locator('input[name="duration"]').click()
        await page.locator('input[name="duration"]').fill('20')
        await page.getByLabel('Status').selectOption('archived')
        await page.getByRole('button', { name: 'Add Field' }).click()
        await page.getByPlaceholder('Enter question text').click()
        await page.getByPlaceholder('Enter question text').fill('algo')
        await page.getByRole('combobox').nth(1).selectOption('multiple_choice')
        await page.getByRole('button', { name: 'Add Field' }).click()
        await page.locator('input[name="formFields\\[1\\]\\.label"]').click()
        await page.locator('input[name="formFields\\[1\\]\\.label"]').fill('Algo ahí')
        await page.getByRole('button', { name: 'Add Option' }).click()
        await page.getByPlaceholder('Enter option').click()
        await page.getByPlaceholder('Enter option').fill('1')
        await page.getByRole('button', { name: 'Add Option' }).click()
        await page.getByPlaceholder('Enter option 2').click()
        await page.getByPlaceholder('Enter option 2').fill('2')
        await page.getByRole('button', { name: 'Add Option' }).click()
        await page.getByPlaceholder('Enter option 3').fill('3')
        await page.getByPlaceholder('Enter option 3').click()
        await page.locator('input[name="formFields\\[1\\]\\.options\\[0\\]\\.value"]').check()
        await page.locator('input[name="formFields\\[1\\]\\.options\\[2\\]\\.value"]').check()
        await page.getByText('Question #0 - Fill in the blank questionQuestion textRemove QuestionQuestion #').click()
        await page.getByRole('button', { name: 'Add Field' }).click()
        await page.locator('input[name="formFields\\[2\\]\\.label"]').click()
        await page.locator('input[name="formFields\\[2\\]\\.label"]').fill('Es tru')
        await page.locator('input[name="formFields\\[2\\]\\.label"]').press('ContextMenu')
        await page.locator('input[name="formFields\\[2\\]\\.label"]').fill('Es true?')
        await page.locator('input[name="formFields\\[2\\]\\.value"]').check()
        await page.getByRole('button', { name: 'Add Field' }).click()
        await page.locator('input[name="formFields\\[3\\]\\.label"]').click()
        await page.locator('input[name="formFields\\[3\\]\\.label"]').fill('es false?')
        await page.getByRole('button', { name: 'Remove Question' }).nth(2).click()
        await page.getByRole('button', { name: 'Create Test' }).click()
    })
})
