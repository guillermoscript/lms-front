import { test, expect } from '@playwright/test'
import { loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

/**
 * Student plan-change (switch) UX — issue #463 (part of #458).
 *
 * Seeded state: alice@student.com holds an ACTIVE subscription to plan 2001
 * (Code Academy Pro Monthly, a 30-day / "monthly" plan). Because she is already
 * subscribed, the pricing page must present her current plan as "Current plan"
 * (never a fresh checkout that would spawn a parallel subscription), and the
 * billing page must offer a "Change plan" action instead of the old
 * dead-end "contact your school" note.
 *
 * These are render-level assertions of the plan-change integration — the parts
 * that are deterministic in the E2E harness. The actual supersession mutation is
 * exercised directly against the DB primitive `change_subscription_plan`
 * (old → canceled, new → active, shared entitlements kept / old-only revoked,
 * plus the same_plan / no_active_subscription / cross-tenant guards) and the
 * `changePlan` server-action orchestration + provider swaps are pinned by the
 * vitest suites (`tests/unit/plan-change-{action,provider}.test.ts`). The
 * in-dialog "Switch" click is intentionally not driven here: base-ui dialogs are
 * not reliably automatable in this harness (see PRs #460/#467).
 */

test.describe('Student plan-change (switch) UX', () => {
  test('pricing shows "Current plan" for a subscribed student instead of a fresh checkout', async ({
    page,
  }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/pricing`)

    // Alice's active plan (2001, monthly) renders as the current plan — the CTA
    // is present but disabled, not a "Subscribe"/checkout link.
    const currentPlan = page.getByTestId('current-plan')
    await expect(currentPlan).toBeVisible()
    await expect(currentPlan).toBeDisabled()
    await expect(currentPlan).toHaveText(/Current plan/i)
  })

  test('billing page offers a "Change plan" action for a switchable subscription', async ({
    page,
  }) => {
    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/billing`)

    // A manual (self-managed) subscription is switchable via supersession, so
    // the "Change plan" trigger is shown rather than the old cancel-only note.
    await expect(page.getByTestId('change-plan-button')).toBeVisible()
  })
})
