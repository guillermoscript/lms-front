import { test } from '@playwright/test'

import { admin } from './components/admin'
import { student } from './components/student'
import { teacher } from './components/teacher'

test.describe('Login', () => {
    // test.beforeAll(async ({ page }) => {
    //     console.log('beforeAll')
    // })

    test('teacher', async ({ page }) => {
        await teacher(page)
        await admin(page)
        await student(page)
    })
})
