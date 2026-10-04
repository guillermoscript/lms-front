import { test, expect } from '@playwright/test'
import { loginAsTeacher } from './utils/auth'
import { BASE, LOCALE } from './utils/constants'

/**
 * #676 — the platform mailer's state is visible, not implied.
 *
 * Every transactional email goes through `sendEmail()`, which silently sends
 * nothing when `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` are unset. Settings → Email
 * now carries a read-only row derived from env presence, so an admin can tell
 * why a recipient got nothing. The spec asserts whichever state the running
 * server is in — locally and in CI the mailer is unset, so the "not configured"
 * branch is the one that matters; a configured server must show the domain.
 */
const MAILER_CONFIGURED = Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN)

test.describe('Settings → Email mailer status (#676)', () => {
  test('shows whether the platform mailer can send', async ({ page }) => {
    test.setTimeout(120_000)
    // owner@e2etest.com is the Default School admin.
    await loginAsTeacher(page, BASE)

    await page.goto(`${BASE}/${LOCALE}/dashboard/admin/settings?tab=email`)
    await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 60_000 })

    const row = page.getByTestId('mailer-status')
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(row).toHaveAttribute('data-configured', MAILER_CONFIGURED ? 'true' : 'false')

    const text = page.getByTestId('mailer-status-text')
    if (MAILER_CONFIGURED) {
      await expect(text).toContainText(process.env.MAILGUN_DOMAIN as string)
    } else {
      await expect(text).toContainText(/not configured/i)
      // The API key is never rendered, configured or not.
      await expect(row).not.toContainText(/MAILGUN_API_KEY=/)
    }
  })
})
