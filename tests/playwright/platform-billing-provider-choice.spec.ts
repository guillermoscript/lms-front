import { test, expect } from '@playwright/test'
import { login } from './utils/auth'
import { BASE, LOCALE, ACCOUNTS } from './utils/constants'

/**
 * The payment-method step on the school's upgrade page, and the contract of the
 * route behind it (issue #603).
 *
 * What this pins that unit tests cannot: the list a school actually SEES is
 * driven by `platform_plan_prices`, and bank transfer is reachable no matter
 * what. Before #603 the surface was two hardcoded buttons — one Stripe, one
 * bank wire — so a super admin could configure a provider and no school could
 * ever pick it, and the bank-transfer option disappeared exactly when a failing
 * card made it necessary.
 *
 * `supabase/seed.sql` seeds a Stripe price row for every paid plan, so "Stripe
 * is offered" is deterministic here. The seeded ids are placeholders, so this
 * spec stops at the dialog rather than following the redirect — completing a
 * real checkout needs live test-mode price ids.
 */

const UPGRADE = `${BASE}/${LOCALE}/dashboard/admin/billing/upgrade`

/** The plan cards are base-ui Buttons; a synthetic click on them is unreliable. */
async function clickByText(page: import('@playwright/test').Page, text: string) {
  await page.evaluate((label) => {
    // startsWith, not equality: the bank-transfer option carries a description
    // line inside the same button.
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.innerText.trim().startsWith(label),
    )
    if (!btn) throw new Error(`no button labelled "${label}"`)
    btn.click()
  }, text)
}

test.describe('platform billing — payment method choice', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, BASE)
    await page.goto(UPGRADE)
    await page.waitForSelector('[data-testid="upgrade-page"]')
  })

  test('choosing a plan asks how to pay, listing the configured providers plus bank transfer', async ({
    page,
  }) => {
    await clickByText(page, 'Choose plan')

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('How would you like to pay?')).toBeVisible()

    // Driven by platform_plan_prices, not by a hardcoded pair.
    await expect(dialog.getByRole('button', { name: 'Stripe' })).toBeVisible()

    // Always available: it settles through platform_payment_requests and needs
    // no price row, so it is never gated on provider configuration.
    await expect(dialog.getByRole('button', { name: /Bank transfer/ })).toBeVisible()
  })

  test('never offers a rail that cannot bill a school recurringly', async ({ page }) => {
    await clickByText(page, 'Choose plan')
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()

    // Student-side rails have no place on a SaaS subscription screen. The filter
    // is the `supportsPlatformBillingCheckout` capability, never a slug list.
    for (const rail of ['Solana', 'Binance Pay', 'Binance (personal)']) {
      await expect(dialog.getByRole('button', { name: rail })).toHaveCount(0)
    }
  })

  test('bank transfer opens the manual request form', async ({ page }) => {
    await clickByText(page, 'Choose plan')
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await clickByText(page, 'Bank transfer')

    // The #480 instructions ladder is untouched by #603 — only the provider it
    // records changed — so the school still lands on the same form.
    await expect(page.getByText(/bank|transfer|reference/i).first()).toBeVisible()
  })
})

test.describe('platform billing — checkout route contract', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password, BASE)
    await page.goto(UPGRADE)
    await page.waitForSelector('[data-testid="upgrade-page"]')
  })

  /** Same-origin POST so the request carries the admin's session cookies. */
  async function checkout(page: import('@playwright/test').Page, body: Record<string, unknown>) {
    return page.evaluate(async (payload) => {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { status: res.status, body: await res.json() }
    }, body)
  }

  test('rejects a missing plan id and an invalid interval before touching the DB', async ({
    page,
  }) => {
    expect((await checkout(page, {})).status).toBe(400)
    const bad = await checkout(page, { planId: 'x', interval: 'weekly' })
    expect(bad.status).toBe(400)
    expect(String(bad.body.error)).toContain('Invalid interval')
  })

  test('404s a plan that does not exist rather than leaking a provider error', async ({ page }) => {
    const res = await checkout(page, { planId: '00000000-0000-0000-0000-0000000000ff' })
    expect(res.status).toBe(404)
  })
})
