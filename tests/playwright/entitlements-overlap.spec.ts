/**
 * Entitlements Overlap Regression
 *
 * Guards the bug fixed by the entitlements migration: buying a subscription
 * plan that covers a course the user already owns via a one-time product used
 * to violate the `enrollments.valid_enrollment` CHECK and return HTTP 500.
 * With the entitlements model the two access sources coexist on one course.
 *
 * Pure DB-level test — exercises the transaction trigger
 * (`trigger_manage_transactions` → `handle_new_subscription`).
 * See docs/ENTITLEMENTS_MIGRATION_PLAN.md.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const OVERLAP_COURSE_ID = 2001 // covered by BOTH product 2001 and plan 2001
const PRODUCT_ID = 2001
const PLAN_ID = 2001

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getAdmin() {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Remove any prior plan-2001 subscription / transaction for Alice (FK-safe). */
async function cleanPlanState() {
  const admin = getAdmin()
  const { data: subs } = await admin
    .from('subscriptions')
    .select('subscription_id')
    .eq('user_id', ALICE_ID)
    .eq('plan_id', PLAN_ID)

  for (const s of subs ?? []) {
    await admin
      .from('entitlements')
      .delete()
      .eq('user_id', ALICE_ID)
      .eq('source_type', 'subscription')
      .eq('source_id', s.subscription_id)
  }
  await admin.from('subscriptions').delete().eq('user_id', ALICE_ID).eq('plan_id', PLAN_ID)
  await admin.from('transactions').delete().eq('user_id', ALICE_ID).eq('plan_id', PLAN_ID)
}

test.beforeAll(cleanPlanState)
test.afterAll(cleanPlanState)

test('plan purchase over a product-owned course does not 500 and entitlements coexist', async ({}, testInfo) => {
  // DB-only test — run once, not once per browser project (shared DB state).
  test.skip(testInfo.project.name !== 'desktop-chromium', 'DB-only regression — single project')

  const admin = getAdmin()

  // 1. Alice owns the overlap course via a one-time product (perpetual).
  const { error: productErr } = await admin.rpc('enroll_user', {
    _user_id: ALICE_ID,
    _product_id: PRODUCT_ID,
  })
  expect(productErr).toBeNull()

  // 2. Buy a subscription plan that ALSO covers that course. Inserting the
  //    transaction fires trigger_manage_transactions → handle_new_subscription.
  //    This is the exact path that previously raised the valid_enrollment
  //    CHECK violation (HTTP 500).
  const { data: tx, error: txErr } = await admin
    .from('transactions')
    .insert({
      user_id: ALICE_ID,
      tenant_id: CODE_ACADEMY_TENANT,
      plan_id: PLAN_ID,
      amount: '19.00',
      currency: 'usd',
      payment_method: 'e2e_overlap_test',
      status: 'successful',
    })
    .select('transaction_id')
    .single()

  // Regression assertion: the overlapping plan purchase must succeed.
  expect(txErr).toBeNull()
  expect(tx?.transaction_id).toBeTruthy()

  // 3. Both access sources coexist as separate entitlements on the same course.
  const { data: entitlements } = await admin
    .from('entitlements')
    .select('source_type, status')
    .eq('user_id', ALICE_ID)
    .eq('course_id', OVERLAP_COURSE_ID)
    .eq('status', 'active')

  const sources = (entitlements ?? []).map((e) => e.source_type)
  expect(sources).toContain('product')
  expect(sources).toContain('subscription')
})
