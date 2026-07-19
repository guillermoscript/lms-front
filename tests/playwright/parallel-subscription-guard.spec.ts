import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

/**
 * P0 — Parallel-subscription double-billing guard (issue #459).
 *
 * Seeded state: alice@student.com holds an ACTIVE subscription to plan 2001
 * (Code Academy Pro Monthly). Plan 2002 (Code Academy Pro Annual) exists in
 * the same tenant. Checking out 2002 must be blocked everywhere; re-checking
 * out 2001 (a renewal) must NOT be blocked.
 *
 * Robustness notes (dev server): the checkout page streams its RSC payload, so
 * the notice is present in the served DOM before it is painted — we assert on
 * DOM presence ('attached') + absence of any payment control, which is exactly
 * "the checkout is blocked" and is not subject to the client paint race. API
 * routes compile on first hit in dev, so `expect.poll` retries through the cold
 * compile until the guard's 409 lands.
 */

/** POST the guard endpoint, retrying through dev-server cold compile. */
function pollStatus(request: APIRequestContext, url: string, planId: number) {
  return expect
    .poll(
      async () => {
        const res = await request.post(url, { data: { planId } })
        return { status: res.status(), code: (await res.json().catch(() => ({}))).code }
      },
      { timeout: 20_000, intervals: [500, 1000, 2000] },
    )
}

test.describe('Parallel-subscription guard', () => {
  test('checkout page blocks a second plan with the conflict notice', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/checkout?planId=2002`, { waitUntil: 'networkidle' })
    // The blocking notice is server-rendered into the DOM; assert presence
    // (not paint) so the RSC streaming swap can't race the check.
    await expect(page.getByTestId('subscription-conflict-notice')).toBeAttached({ timeout: 15_000 })
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeAttached()
    // No payment UI of any kind is served behind the notice.
    await expect(page.getByText(/Pay & Enroll/i)).toHaveCount(0)
  })

  test('same-plan checkout (renewal) is not blocked', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/checkout?planId=2001`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('subscription-conflict-notice')).toHaveCount(0)
    // Normal checkout renders the order summary for the plan.
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeAttached()
  })

  test('create-payment-intent API returns 409 for a second plan', async ({ page }) => {
    await loginAsTenantStudent(page)
    await pollStatus(page.request, `${TENANT_BASE}/api/stripe/create-payment-intent`, 2002)
      .toEqual({ status: 409, code: 'parallel_subscription' })
  })

  test('unified payments checkout API returns 409 for a second plan', async ({ page }) => {
    await loginAsTenantStudent(page)
    await pollStatus(page.request, `${TENANT_BASE}/api/payments/checkout`, 2002)
      .toEqual({ status: 409, code: 'parallel_subscription' })
  })

  test('same-plan API checkout is not treated as a conflict', async ({ page }) => {
    await loginAsTenantStudent(page)
    const url = `${TENANT_BASE}/api/stripe/create-payment-intent`
    // Warm the route, then confirm the guard does NOT fire for the held plan.
    await page.request.post(url, { data: { planId: 2001 } }).catch(() => {})
    const res = await page.request.post(url, { data: { planId: 2001 } })
    // Locally the school has no Stripe account connected, so the request can
    // fail further down the route — the guard specifically must not fire.
    expect(res.status()).not.toBe(409)
  })
})
