import { test, expect } from '@playwright/test'
import { loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

/**
 * P0 — Parallel-subscription double-billing guard (issue #459).
 *
 * Seeded state: alice@student.com holds an ACTIVE subscription to plan 2001
 * (Code Academy Pro Monthly). Plan 2002 (Code Academy Pro Annual) exists in
 * the same tenant. Checking out 2002 must be blocked everywhere; re-checking
 * out 2001 (a renewal) must NOT be blocked.
 */

test.describe('Parallel-subscription guard', () => {
  test('checkout page blocks a second plan with the conflict notice', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/checkout?planId=2002`)
    await expect(page.getByTestId('subscription-conflict-notice')).toBeVisible()
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeVisible()
    // No payment UI of any kind behind the notice
    await expect(page.getByText(/Pay & Enroll/i)).toHaveCount(0)
  })

  test('same-plan checkout (renewal) is not blocked', async ({ page }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/checkout?planId=2001`)
    await expect(page.getByTestId('subscription-conflict-notice')).toHaveCount(0)
    // Normal checkout renders the order summary for the plan
    await expect(page.getByText(/Code Academy Pro Monthly/i)).toBeVisible()
  })

  test('create-payment-intent API returns 409 for a second plan', async ({ page }) => {
    await loginAsTenantStudent(page)
    const res = await page.request.post(`${TENANT_BASE}/api/stripe/create-payment-intent`, {
      data: { planId: 2002 },
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('parallel_subscription')
  })

  test('unified payments checkout API returns 409 for a second plan', async ({ page }) => {
    await loginAsTenantStudent(page)
    const res = await page.request.post(`${TENANT_BASE}/api/payments/checkout`, {
      data: { planId: 2002 },
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('parallel_subscription')
  })

  test('same-plan API checkout is not treated as a conflict', async ({ page }) => {
    await loginAsTenantStudent(page)
    const res = await page.request.post(`${TENANT_BASE}/api/stripe/create-payment-intent`, {
      data: { planId: 2001 },
    })
    // Locally the school has no Stripe account connected, so the request can
    // fail further down the route — the guard specifically must not fire.
    expect(res.status()).not.toBe(409)
  })
})
