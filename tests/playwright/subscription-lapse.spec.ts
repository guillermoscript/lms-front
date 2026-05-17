/**
 * Subscription Lapse / Revocation Regression
 *
 * Guards the core invariant of the entitlements model:
 *   - Subscription lapse revokes ONLY subscription entitlements.
 *   - Perpetual (product) entitlements survive a lapse on the same course.
 *   - Plan-only courses lose access on lapse.
 *   - Reactivation restores subscription entitlements.
 *
 * Exercises: transaction insert trigger → handle_new_subscription,
 * subscriptions UPDATE trigger → handle_subscription_status_change,
 * has_course_access() RPC.
 *
 * Pure DB-level test (no browser). Runs once (single Playwright project guard).
 * See docs/ENTITLEMENTS_MIGRATION_PLAN.md.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'

/** Plan 2001 — "Code Academy Pro Monthly" — covers courses 2001, 2002, 10005 */
const PLAN_ID = 2001

/** Course 2001 is BOTH covered by plan AND purchasable as product 2001 (overlap A) */
const OVERLAP_COURSE_A = 2001
const PRODUCT_A_ID = 2001

/**
 * Course 2002 is ALSO an overlap — Alice owns it via product 2002 (seed data)
 * AND plan 2001 covers it. Validates the second perpetual-survives-lapse path.
 */
const OVERLAP_COURSE_B = 2002

/** Course 10005 is plan-only — Alice has no product entitlement for it. */
const PLAN_ONLY_COURSE = 10005

/* ------------------------------------------------------------------ */
/*  Supabase admin client                                              */
/* ------------------------------------------------------------------ */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getAdmin() {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
async function cleanState() {
  const admin = getAdmin()

  // Remove plan-2001 subscriptions and their entitlements for Alice
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

  // Remove product-A entitlement created by this spec (course 2001 via product 2001).
  // The seed-data product entitlement for course 2002 (product 2002) is intentionally kept.
  await admin
    .from('entitlements')
    .delete()
    .eq('user_id', ALICE_ID)
    .eq('source_type', 'product')
    .eq('source_id', PRODUCT_A_ID)
    .eq('course_id', OVERLAP_COURSE_A)

  // Remove enrollment row for course 2001 created by enroll_user in this test
  await admin
    .from('enrollments')
    .delete()
    .eq('user_id', ALICE_ID)
    .eq('course_id', OVERLAP_COURSE_A)
    .eq('tenant_id', CODE_ACADEMY_TENANT)

  await admin.from('transactions').delete().eq('user_id', ALICE_ID).eq('product_id', PRODUCT_A_ID)
}

async function hasAccess(admin: ReturnType<typeof getAdmin>, courseId: number): Promise<boolean> {
  const { data } = await admin.rpc('has_course_access', {
    _user_id: ALICE_ID,
    _course_id: courseId,
  })
  return data === true
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
test.beforeAll(cleanState)
test.afterAll(cleanState)

test('subscription lapse revokes plan entitlements but not perpetual product entitlements', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'DB-only regression — single project')
  test.setTimeout(30_000)

  const admin = getAdmin()

  // ── Step 1: Alice buys overlap course A as a one-time product ────────────
  // This mirrors the "paid checkout" flow — trigger enrolls her via product.
  const { error: productErr } = await admin.rpc('enroll_user', {
    _user_id: ALICE_ID,
    _product_id: PRODUCT_A_ID,
  })
  expect(productErr).toBeNull()

  // Confirm product entitlement active for both overlap courses
  expect(await hasAccess(admin, OVERLAP_COURSE_A)).toBe(true)
  // Course 2002 perpetual product entitlement comes from seed data
  expect(await hasAccess(admin, OVERLAP_COURSE_B)).toBe(true)

  // ── Step 2: Alice buys plan 2001 (subscription) ────────────────────────────
  // Inserting a successful plan transaction fires trigger_manage_transactions
  // → handle_new_subscription → creates subscription row + 3 entitlements
  //   (courses 2001, 2002, 10005).
  const { data: tx, error: txErr } = await admin
    .from('transactions')
    .insert({
      user_id: ALICE_ID,
      tenant_id: CODE_ACADEMY_TENANT,
      plan_id: PLAN_ID,
      amount: '19.00',
      currency: 'usd',
      payment_method: 'e2e_lapse_test',
      status: 'successful',
    })
    .select('transaction_id')
    .single()

  expect(txErr).toBeNull()
  expect(tx?.transaction_id).toBeTruthy()

  // Retrieve the subscription created by the trigger
  const { data: sub } = await admin
    .from('subscriptions')
    .select('subscription_id, subscription_status')
    .eq('user_id', ALICE_ID)
    .eq('plan_id', PLAN_ID)
    .single()

  expect(sub?.subscription_id).toBeTruthy()
  expect(sub?.subscription_status).toBe('active')

  // Overlap course A: 1 product + 1 subscription entitlement
  const { data: overlapEntsA } = await admin
    .from('entitlements')
    .select('source_type, status')
    .eq('user_id', ALICE_ID)
    .eq('course_id', OVERLAP_COURSE_A)
    .eq('status', 'active')

  const sourcesA = (overlapEntsA ?? []).map((e) => e.source_type)
  expect(sourcesA).toContain('product')
  expect(sourcesA).toContain('subscription')

  // Overlap course B: product (seed) + subscription
  const { data: overlapEntsB } = await admin
    .from('entitlements')
    .select('source_type, status')
    .eq('user_id', ALICE_ID)
    .eq('course_id', OVERLAP_COURSE_B)
    .eq('status', 'active')

  const sourcesB = (overlapEntsB ?? []).map((e) => e.source_type)
  expect(sourcesB).toContain('product')
  expect(sourcesB).toContain('subscription')

  // Plan-only course has subscription access
  expect(await hasAccess(admin, PLAN_ONLY_COURSE)).toBe(true)

  // ── Step 3: Subscription lapses (canceled) ─────────────────────────────────
  // UPDATE fires handle_subscription_status_change trigger which sets
  // entitlements with source_id = subscription_id → status = 'expired'.
  const { error: lapseErr } = await admin
    .from('subscriptions')
    .update({ subscription_status: 'canceled' })
    .eq('subscription_id', sub!.subscription_id)

  expect(lapseErr).toBeNull()

  // ── Step 4: Core invariant assertions ─────────────────────────────────────
  // Subscription entitlements for this sub must be expired
  const { data: subEnts } = await admin
    .from('entitlements')
    .select('course_id, source_type, status')
    .eq('user_id', ALICE_ID)
    .eq('source_type', 'subscription')
    .eq('source_id', sub!.subscription_id)

  for (const e of subEnts ?? []) {
    expect(e.status).toBe('expired')
  }

  // Overlap course A: product entitlement MUST still be active
  const { data: productEntA } = await admin
    .from('entitlements')
    .select('status')
    .eq('user_id', ALICE_ID)
    .eq('course_id', OVERLAP_COURSE_A)
    .eq('source_type', 'product')
    .eq('source_id', PRODUCT_A_ID)
    .single()

  expect(productEntA?.status).toBe('active')

  // Overlap course B: seed-data product entitlement MUST still be active
  const { data: productEntB } = await admin
    .from('entitlements')
    .select('status')
    .eq('user_id', ALICE_ID)
    .eq('course_id', OVERLAP_COURSE_B)
    .eq('source_type', 'product')
    .single()

  expect(productEntB?.status).toBe('active')

  // has_course_access reflects entitlement state
  expect(await hasAccess(admin, OVERLAP_COURSE_A)).toBe(true)  // product path
  expect(await hasAccess(admin, OVERLAP_COURSE_B)).toBe(true)  // product path (seed)
  expect(await hasAccess(admin, PLAN_ONLY_COURSE)).toBe(false) // plan-only → lost

  // ── Step 5: Reactivation restores subscription entitlements ───────────────
  const { error: reactiveErr } = await admin
    .from('subscriptions')
    .update({ subscription_status: 'active' })
    .eq('subscription_id', sub!.subscription_id)

  expect(reactiveErr).toBeNull()

  // Subscription entitlements back to active
  const { data: reactivatedEnts } = await admin
    .from('entitlements')
    .select('course_id, status')
    .eq('user_id', ALICE_ID)
    .eq('source_type', 'subscription')
    .eq('source_id', sub!.subscription_id)

  for (const e of reactivatedEnts ?? []) {
    expect(e.status).toBe('active')
  }

  expect(await hasAccess(admin, PLAN_ONLY_COURSE)).toBe(true)
})
