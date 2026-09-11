/**
 * The "Continue with Google" button on /create-school never goes dead
 * (Sentry LMS-FRONT-9P — rage clicks from a network where Google is blocked).
 *
 * `signInWithOAuth` resolves the moment supabase-js calls
 * `window.location.assign`, not when the navigation lands. Where
 * accounts.google.com is unreachable the hop just never completes, the page
 * stays put, and before this fix the button gave no feedback at all — so the
 * visitor clicked it again and again.
 *
 * The OAuth hop is stubbed with a 204: the browser abandons the navigation and
 * stays on the page, which is exactly the "redirect that never lands" shape.
 */
import { test, expect } from '@playwright/test'
import { BASE, LOCALE } from './utils/constants'

const GOOGLE_BUTTON = 'create-school-google'
const STALLED_HINT = 'create-school-google-stalled'

test.describe('create-school Google button', () => {
  test('shows a pending state, absorbs rage clicks, then offers the email form', async ({ page }) => {
    let oauthHops = 0
    await page.route(/accounts\.google\.com|\/auth\/v1\/authorize/, (route) => {
      oauthHops++
      return route.fulfill({ status: 204, body: '' })
    })

    await page.goto(`${BASE}/${LOCALE}/create-school`)
    const button = page.getByTestId(GOOGLE_BUTTON)
    await expect(button).toBeEnabled()

    // base-ui Buttons ignore Playwright's synthetic click (see tests/README.md)
    const click = () => page.evaluate(
      (id) => (document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click(),
      GOOGLE_BUTTON,
    )

    await click()
    await expect(button).toBeDisabled()
    await expect(button).toHaveText(/Redirecting to Google/i)

    // Three more clicks in quick succession — the Sentry replay's rage click
    for (let i = 0; i < 3; i++) await click()
    expect(oauthHops).toBe(1)

    // Google never answered: the button comes back and points at the email form
    await expect(page.getByTestId(STALLED_HINT)).toBeVisible({ timeout: 15000 })
    await expect(button).toBeEnabled()
    await expect(page.getByLabel(/your name/i)).toBeVisible()
  })
})
