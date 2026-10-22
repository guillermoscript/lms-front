import { test, expect } from './utils/test'
import { loginAsAdmin } from './utils/auth'
import { TENANT_BASE } from './utils/constants'
import { noisePng } from './utils/images'

/**
 * Asset library: a file dropped on the Assets page is recorded for the school
 * by the storage trigger, shows who uploaded it and that nothing uses it, and
 * can be deleted again.
 */
test.describe('Tenant assets', () => {
  test('admin uploads, inspects and deletes an asset', async ({ page }) => {
    const fileName = `e2e-asset-${Date.now()}.png`
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/admin/assets`)
    await expect(page.getByTestId('assets-page')).toBeVisible()

    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: fileName, mimeType: 'image/png', buffer: noisePng(64) })
    await page.getByRole('button', { name: 'Upload files' }).click()
    await expect(page.getByText('Successfully uploaded')).toBeVisible({ timeout: 20_000 })

    // The storage trigger recorded it: it appears in the library, unused.
    const card = page.getByRole('button', { name: /Details of .*e2e-asset-/ }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Uploaded by')).toBeVisible()
    await expect(dialog.getByText('Not recorded')).toHaveCount(0)
    await expect(dialog.getByText('Nothing in your school uses this file.')).toBeVisible()

    await dialog.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('File deleted')).toBeVisible()
  })
})
