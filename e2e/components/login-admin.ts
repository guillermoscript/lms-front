import { Page } from '@playwright/test'

import { creds } from '../utils/creds'

export const loginAdmin = async (page: Page) => {
    await page.getByPlaceholder('you@example.com').fill(creds.admin.email)
    await page.getByPlaceholder('••••••••').fill(creds.admin.pass)
    await page.getByRole('button', { name: 'Login' }).click()
}
