import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

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
 * that are deterministic in the E2E harness. The in-dialog "Switch" click is
 * intentionally not driven here: base-ui dialogs are not reliably automatable in
 * this harness (see PRs #460/#467).
 *
 * The supersession mutation itself lives in
 * `subscription-plan-change-rpc.spec.ts`, which drives
 * `change_subscription_plan` against a seeded DB as a real authenticated
 * student: A → B, A → B → A, cancel-then-switch, same_plan, cross-tenant, the
 * price gate and the advisory lock, asserting the entitlement delta per course.
 * This file used to CLAIM that coverage while nothing exercised the RPC at all,
 * which is how two of the three #545 bugs shipped — including a `cancel_at =
 * NULL` write into a NOT NULL column that failed every A → B → A round trip.
 * The `changePlan` server-action orchestration + provider swaps are pinned by
 * the vitest suites (`tests/unit/plan-change-{action,provider}.test.ts`).
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

/**
 * A `past_due` subscription is still LIVE — it bills and it grants access — but
 * the billing page only treated `active`/`renewed` as the current subscription,
 * so a student mid-dunning got the "no subscription" empty state: no cancel, no
 * switch, no explanation, while the school kept charging them (#545). Both
 * server actions accept `past_due`; the UI simply never offered it.
 */
test.describe('Student billing — past_due subscription', () => {
  test('renders the subscription with a dunning notice and full management actions', async ({
    page,
  }) => {
    const admin = getAdmin()
    const { data: before } = await admin
      .from('subscriptions')
      .select('subscription_id, subscription_status')
      .eq('user_id', ALICE_ID)
      .eq('plan_id', 2001)
      .single()
    expect(before).not.toBeNull()

    await admin
      .from('subscriptions')
      .update({ subscription_status: 'past_due' })
      .eq('subscription_id', before!.subscription_id)

    try {
      await loginAsTenantStudent(page)
      await page.goto(`${TENANT_BASE}/en/dashboard/student/billing`)

      // Not the empty state: the real card, badged past due.
      await expect(page.getByText('Past due', { exact: true })).toBeVisible()
      await expect(page.getByText(/last payment didn't go through/i)).toBeVisible()

      // …and the student can still act on it.
      await expect(page.getByTestId('change-plan-button')).toBeVisible()
      await expect(page.getByTestId('cancel-subscription-button')).toBeVisible()
    } finally {
      // Restore the seeded state for every spec that depends on it.
      await admin
        .from('subscriptions')
        .update({ subscription_status: before!.subscription_status })
        .eq('subscription_id', before!.subscription_id)
    }
  })
})
