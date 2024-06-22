import { Page } from '@playwright/test'

export const setSystemTheme = async (page: Page) => {
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await page.getByRole('menuitem', { name: 'Dark' }).click()
}
