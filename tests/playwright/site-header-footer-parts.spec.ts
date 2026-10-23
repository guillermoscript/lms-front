/**
 * Global site header/footer ("template parts"): the admin card that edits them, and the
 * restricted editor palette (a part editor only offers the one block it edits).
 */
import { test, expect } from './utils/test'
import { TENANT_BASE, LOCALE } from './utils/constants'
import { loginAsAdmin } from './utils/auth'

test('admin sees the site header & footer card and a header-only editor', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/admin/landing-page`)

  await expect(page.getByText('Site header & footer')).toBeVisible()
  await page.getByRole('button', { name: /^(Edit|Set up)$/ }).first().evaluate((b: HTMLElement) => b.click())

  // The editor replaced the admin list: Puck's left rail is on screen.
  await expect(page.getByText('Site header & footer')).toHaveCount(0, { timeout: 30_000 })
  const rail = page.locator('[class*="Puck"]').first()
  await expect(rail).toBeVisible()
  await expect(page.getByText('NAVIGATION', { exact: true })).toBeVisible()
  await expect(page.getByText('Header', { exact: true }).first()).toBeVisible()
  // Only the one block it edits: none of the page blocks.
  for (const block of ['Hero', 'Pricing', 'Testimonials', 'FAQ']) {
    await expect(page.getByText(block, { exact: true })).toHaveCount(0)
  }
})
