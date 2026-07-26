/**
 * `change_subscription_plan` against a seeded database — issue #545 (EPIC #540 §2.2).
 *
 * The supersession primitive had never been exercised end to end. `plan-change.spec.ts`
 * claimed this coverage existed ("exercised directly against the DB primitive
 * change_subscription_plan"); it did not, and two of the three bugs #545 lists
 * were sitting in the parts nothing ran:
 *
 *   * the reactivate-an-existing-row branch wrote `cancel_at = NULL` into a
 *     NOT NULL column, so EVERY switch back to a previously-held plan died with
 *     23502 — the canonical A → B → A downgrade could never complete;
 *   * nothing anywhere compared prices, so a student on a one-click FREE plan
 *     could switch to the school's paid manual plan and receive its entitlements
 *     with no transaction and no payment_requests row to reconcile.
 *
 * These drive the RPC as a REAL authenticated student (role `authenticated`,
 * `auth.uid()` = the caller) because that is the surface it is granted on, and
 * assert the ENTITLEMENT DELTA PER COURSE — shared courses kept, old-only
 * courses revoked — which is the thing a student actually feels.
 *
 * Fixtures are private to this spec: a dedicated QA user and QA plans, created
 * and torn down here, so the shared seed rows (alice's plan-2001 subscription,
 * which half the suite depends on) are never touched.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const CODE_ACADEMY = '00000000-0000-0000-0000-000000000002'
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'

/** Code Academy courses — SHARED sits in both QA plans, ALPHA_ONLY in one. */
const COURSE_SHARED = 2001
const COURSE_ALPHA_ONLY = 2002
/** A Default School course, for the cross-tenant plan. */
const COURSE_OTHER_TENANT = 1001

const QA_EMAIL = 'qa-545-plan-change@e2etest.com'
const QA_PASSWORD = 'password123'
const QA_PLAN_PREFIX = '[E2E 545]'

const FAR_FUTURE_YEAR = 2126

function getAdmin(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const admin = getAdmin()

/** The plan ids created in beforeAll. */
const plans = {
  /** price 19 · courses SHARED + ALPHA_ONLY — the starting plan. */
  alpha: 0,
  /** price 19 · courses SHARED — same price, narrower course set. */
  beta: 0,
  /** price 99 · an upgrade nothing settles. */
  premium: 0,
  /** price 0 · the one-click free plan. */
  free: 0,
  /** Another school's plan entirely. */
  foreign: 0,
}

let qaUserId = ''
/** User-scoped client for the QA student — role `authenticated`. */
let qa: SupabaseClient

async function createPlan(opts: {
  name: string
  price: number
  tenantId: string
  courseIds: number[]
}): Promise<number> {
  const { data, error } = await admin
    .from('plans')
    .insert({
      plan_name: `${QA_PLAN_PREFIX} ${opts.name}`,
      price: opts.price,
      duration_in_days: 30,
      currency: 'usd',
      payment_provider: 'manual',
      tenant_id: opts.tenantId,
    })
    .select('plan_id')
    .single()
  expect(error, `create plan ${opts.name}`).toBeNull()
  const planId = data!.plan_id as number

  if (opts.courseIds.length > 0) {
    const { error: linkError } = await admin
      .from('plan_courses')
      .insert(opts.courseIds.map((course_id) => ({ plan_id: planId, course_id })))
    expect(linkError, `link courses for ${opts.name}`).toBeNull()
  }
  return planId
}

/**
 * Wipe the QA student's billing state. Deleting the transactions cascades the
 * subscriptions (subscriptions_transaction_id_fkey ON DELETE CASCADE), which
 * also clears the #459 backstop so the next seed can create a fresh one.
 */
async function resetBilling() {
  await admin.from('entitlements').delete().eq('user_id', qaUserId)
  await admin.from('transactions').delete().eq('user_id', qaUserId)
}

/**
 * Put the student on `planId` the normal way: a settled transaction, whose
 * after_transaction_insert trigger runs handle_new_subscription (subscription
 * row + plan_courses entitlements).
 */
async function subscribeTo(planId: number, amount: number) {
  const { error } = await admin.from('transactions').insert({
    user_id: qaUserId,
    tenant_id: CODE_ACADEMY,
    plan_id: planId,
    amount,
    currency: 'usd',
    payment_method: 'manual',
    status: 'successful',
  })
  expect(error, `seed subscription for plan ${planId}`).toBeNull()
}

interface SubSnapshot {
  subscription_id: number
  plan_id: number
  subscription_status: string
  cancel_at: string | null
  cancel_at_period_end: boolean
  current_period_end: string
  superseded_by: number | null
  payment_provider: string
}

async function subscriptions(): Promise<SubSnapshot[]> {
  const { data, error } = await admin
    .from('subscriptions')
    .select(
      'subscription_id, plan_id, subscription_status, cancel_at, cancel_at_period_end, current_period_end, superseded_by, payment_provider'
    )
    .eq('user_id', qaUserId)
    .order('subscription_id', { ascending: true })
  expect(error).toBeNull()
  return (data ?? []) as SubSnapshot[]
}

interface CourseAccess {
  /** Any ACTIVE entitlement for this course — what has_course_access answers. */
  active: boolean
  /** The subscription granting the active entitlement, if there is one. */
  sourceId: number | null
  expiresAt: string | null
}

/**
 * course_id → effective access, across every entitlement row for that course.
 *
 * A supersession leaves MORE THAN ONE row per course: the unique key is
 * (user_id, course_id, source_type, source_id), so a course shared by the old
 * and new plan ends up with the old subscription's row expired and the new
 * subscription's row active. Reading "the" row for a course would pick one of
 * them arbitrarily; access is the OR over all of them.
 */
async function accessByCourse(): Promise<Record<number, CourseAccess>> {
  const { data, error } = await admin
    .from('entitlements')
    .select('course_id, status, source_id, expires_at')
    .eq('user_id', qaUserId)
    .eq('source_type', 'subscription')
  expect(error).toBeNull()

  const map: Record<number, CourseAccess> = {}
  for (const row of data ?? []) {
    const courseId = row.course_id as number
    map[courseId] ??= { active: false, sourceId: null, expiresAt: null }
    if (row.status === 'active') {
      map[courseId] = {
        active: true,
        sourceId: row.source_id as number | null,
        expiresAt: row.expires_at as string | null,
      }
    }
  }
  return map
}

/** The DB's own access oracle — the check every gated page/route runs. */
async function hasCourseAccess(courseId: number): Promise<boolean> {
  const { data, error } = await admin.rpc('has_course_access', {
    _user_id: qaUserId,
    _course_id: courseId,
  })
  expect(error, error?.message).toBeNull()
  return data === true
}

async function switchTo(planId: number) {
  return qa.rpc('change_subscription_plan', { _new_plan_id: planId })
}

/** The single live subscription, asserted to be unique. */
function soleLive(rows: SubSnapshot[]): SubSnapshot {
  const live = rows.filter((r) => ['active', 'renewed', 'past_due'].includes(r.subscription_status))
  expect(live, 'exactly one live subscription').toHaveLength(1)
  return live[0]
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  // A dedicated student — created through the auth admin API so
  // handle_new_user() fires and the profile exists.
  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const previous = existing.data?.users?.find((u) => u.email === QA_EMAIL)
  if (previous) await admin.auth.admin.deleteUser(previous.id)

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: QA_EMAIL,
    password: QA_PASSWORD,
    email_confirm: true,
  })
  expect(createError, 'create QA user').toBeNull()
  qaUserId = created!.user!.id

  const { error: memberError } = await admin
    .from('tenant_users')
    .insert({ tenant_id: CODE_ACADEMY, user_id: qaUserId, role: 'student', status: 'active' })
  expect(memberError, 'add QA user to Code Academy').toBeNull()

  plans.alpha = await createPlan({
    name: 'Alpha',
    price: 19,
    tenantId: CODE_ACADEMY,
    courseIds: [COURSE_SHARED, COURSE_ALPHA_ONLY],
  })
  // Same price as Alpha on purpose: an A → B → A round trip must not be
  // refused by the price gate, so the reactivate-existing-row branch (the
  // 23502 crash site) is what gets exercised.
  plans.beta = await createPlan({
    name: 'Beta',
    price: 19,
    tenantId: CODE_ACADEMY,
    courseIds: [COURSE_SHARED],
  })
  plans.premium = await createPlan({
    name: 'Premium',
    price: 99,
    tenantId: CODE_ACADEMY,
    courseIds: [COURSE_SHARED, COURSE_ALPHA_ONLY],
  })
  plans.free = await createPlan({
    name: 'Free',
    price: 0,
    tenantId: CODE_ACADEMY,
    courseIds: [COURSE_SHARED],
  })
  plans.foreign = await createPlan({
    name: 'Foreign',
    price: 19,
    tenantId: DEFAULT_TENANT,
    courseIds: [COURSE_OTHER_TENANT],
  })

  qa = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error: signInError } = await qa.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  })
  expect(signInError, 'sign in as QA student').toBeNull()
})

test.afterAll(async () => {
  if (qaUserId) {
    await resetBilling()
    await admin.auth.admin.deleteUser(qaUserId)
  }
  const planIds = Object.values(plans).filter(Boolean)
  if (planIds.length > 0) {
    await admin.from('plan_courses').delete().in('plan_id', planIds)
    await admin.from('plans').delete().in('plan_id', planIds)
  }
})

test.beforeEach(async () => {
  await resetBilling()
})

test.describe('change_subscription_plan — supersession', () => {
  test('A → B: old subscription superseded, shared course kept, old-only course revoked', async () => {
    await subscribeTo(plans.alpha, 19)

    const before = await accessByCourse()
    expect(before[COURSE_SHARED].active).toBe(true)
    expect(before[COURSE_ALPHA_ONLY].active).toBe(true)

    const { error } = await switchTo(plans.beta)
    expect(error, error?.message).toBeNull()

    const rows = await subscriptions()
    const live = soleLive(rows)
    expect(live.plan_id).toBe(plans.beta)

    const old = rows.find((r) => r.plan_id === plans.alpha)!
    expect(old.subscription_status).toBe('canceled')
    expect(old.superseded_by).toBe(live.subscription_id)

    // The entitlement delta is the whole point: Beta covers SHARED only.
    const after = await accessByCourse()
    expect(after[COURSE_SHARED].active).toBe(true)
    expect(after[COURSE_SHARED].sourceId).toBe(live.subscription_id)
    expect(after[COURSE_ALPHA_ONLY].active).toBe(false)
    // Cross-checked against the oracle every gated route uses.
    expect(await hasCourseAccess(COURSE_SHARED)).toBe(true)
    expect(await hasCourseAccess(COURSE_ALPHA_ONLY)).toBe(false)
  })

  test('A → B → A round trip succeeds and restores the old-only course', async () => {
    // The regression that shipped: the return leg reactivates the existing
    // (user, Alpha) row — the branch that wrote NULL into a NOT NULL cancel_at
    // and failed with 23502 every single time.
    await subscribeTo(plans.alpha, 19)

    const out = await switchTo(plans.beta)
    expect(out.error, out.error?.message).toBeNull()

    const back = await switchTo(plans.alpha)
    expect(back.error, back.error?.message).toBeNull()

    const rows = await subscriptions()
    expect(rows).toHaveLength(2) // reactivated, never duplicated
    const live = soleLive(rows)
    expect(live.plan_id).toBe(plans.alpha)
    expect(live.cancel_at).toBeNull()
    expect(live.cancel_at_period_end).toBe(false)

    const beta = rows.find((r) => r.plan_id === plans.beta)!
    expect(beta.subscription_status).toBe('canceled')
    expect(beta.superseded_by).toBe(live.subscription_id)

    const after = await accessByCourse()
    expect(after[COURSE_SHARED].active).toBe(true)
    expect(after[COURSE_ALPHA_ONLY].active).toBe(true)
    expect(after[COURSE_ALPHA_ONLY].sourceId).toBe(live.subscription_id)
    expect(await hasCourseAccess(COURSE_SHARED)).toBe(true)
    expect(await hasCourseAccess(COURSE_ALPHA_ONLY)).toBe(true)
  })

  test('cancel → switch carries the pending cancel to the new plan', async () => {
    await subscribeTo(plans.alpha, 19)
    const [initial] = await subscriptions()
    await admin
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        cancel_at: initial.current_period_end,
        canceled_at: new Date().toISOString(),
      })
      .eq('subscription_id', initial.subscription_id)

    const { error } = await switchTo(plans.beta)
    expect(error, error?.message).toBeNull()

    // The student asked to stop at period end and Stripe still holds that
    // instruction (the in-place swap never clears it), so our row must agree —
    // it used to be reset to "renews", hiding the resume affordance too.
    const live = soleLive(await subscriptions())
    expect(live.plan_id).toBe(plans.beta)
    expect(live.cancel_at_period_end).toBe(true)
    expect(live.cancel_at).not.toBeNull()
    expect(new Date(live.cancel_at!).getTime()).toBe(new Date(live.current_period_end).getTime())
  })

  test('same_plan is refused and writes nothing', async () => {
    await subscribeTo(plans.alpha, 19)
    const before = await subscriptions()

    const { error } = await switchTo(plans.alpha)
    expect(error?.message).toContain('same_plan')

    expect(await subscriptions()).toEqual(before)
  })

  test('a plan in another school is unreachable', async () => {
    await subscribeTo(plans.alpha, 19)

    // The RPC derives the tenant from the TARGET plan, so the caller's Code
    // Academy subscription is not even a candidate to supersede.
    const { error } = await switchTo(plans.foreign)
    expect(error?.message).toContain('no_active_subscription')

    const rows = await subscriptions()
    expect(rows).toHaveLength(1)
    expect(rows[0].plan_id).toBe(plans.alpha)
    expect(rows[0].subscription_status).toBe('active')

    const after = await accessByCourse()
    expect(after[COURSE_OTHER_TENANT]).toBeUndefined()
  })
})

test.describe('change_subscription_plan — price authority', () => {
  test('a free plan cannot be switched to a paid one without a settled transaction', async () => {
    // The exact #545 bug 3 path: one-click free activation, then Billing →
    // Change plan → the school's paid manual plan.
    const { error: grantError } = await qa.rpc('grant_free_subscription', {
      _user_id: qaUserId,
      _plan_id: plans.free,
    })
    expect(grantError, grantError?.message).toBeNull()

    const freeSub = soleLive(await subscriptions())
    expect(freeSub.plan_id).toBe(plans.free)
    expect(new Date(freeSub.current_period_end).getUTCFullYear()).toBe(FAR_FUTURE_YEAR)

    const { error } = await switchTo(plans.alpha)
    expect(error?.message).toContain('upgrade_requires_payment')

    // Nothing moved: no Alpha subscription, no Alpha-only entitlement, and the
    // free plan is exactly as it was.
    const rows = await subscriptions()
    expect(rows).toHaveLength(1)
    expect(rows[0].plan_id).toBe(plans.free)
    expect(rows[0].subscription_status).toBe('active')

    const after = await accessByCourse()
    expect(after[COURSE_ALPHA_ONLY]).toBeUndefined()
    expect(await hasCourseAccess(COURSE_ALPHA_ONLY)).toBe(false)

    // And no money was recorded for the upgrade that did not happen.
    const { data: txns } = await admin
      .from('transactions')
      .select('transaction_id, plan_id, status')
      .eq('user_id', qaUserId)
    expect((txns ?? []).some((t) => t.plan_id === plans.alpha)).toBe(false)
  })

  test('a self-managed subscription cannot be upgraded to a pricier plan', async () => {
    await subscribeTo(plans.alpha, 19)

    const { error } = await switchTo(plans.premium)
    expect(error?.message).toContain('upgrade_requires_payment')

    const live = soleLive(await subscriptions())
    expect(live.plan_id).toBe(plans.alpha)
  })

  test('a same-price switch is allowed (the gate is about paying more, not about switching)', async () => {
    await subscribeTo(plans.alpha, 19)
    const { error } = await switchTo(plans.beta)
    expect(error, error?.message).toBeNull()
    expect(soleLive(await subscriptions()).plan_id).toBe(plans.beta)
  })

  test('switching down to a free plan grants the never-expiring period', async () => {
    await subscribeTo(plans.alpha, 19)

    const { error } = await switchTo(plans.free)
    expect(error, error?.message).toBeNull()

    const live = soleLive(await subscriptions())
    expect(live.plan_id).toBe(plans.free)
    // Free subscriptions never expire — same horizon grant_free_subscription
    // uses, so the plan does not silently lapse when the prepaid period of the
    // plan they left runs out.
    expect(new Date(live.current_period_end).getUTCFullYear()).toBe(FAR_FUTURE_YEAR)

    const after = await accessByCourse()
    expect(after[COURSE_SHARED].active).toBe(true)
    expect(new Date(after[COURSE_SHARED].expiresAt!).getUTCFullYear()).toBe(FAR_FUTURE_YEAR)
    expect(after[COURSE_ALPHA_ONLY].active).toBe(false)
  })
})

test.describe('change_subscription_plan — concurrency', () => {
  test('a double submit leaves exactly one live subscription (advisory lock)', async () => {
    await subscribeTo(plans.alpha, 19)

    // Two calls in flight at once — the dialog's `pending` disable is per-tab,
    // so this is a plain double click across two tabs. Without
    // pg_advisory_xact_lock both read the same live Alpha row and race.
    const [first, second] = await Promise.all([switchTo(plans.beta), switchTo(plans.beta)])
    const results = [first, second]

    const succeeded = results.filter((r) => !r.error)
    const failed = results.filter((r) => r.error)
    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    // The loser blocked on the lock, then saw the committed state: it is
    // already on Beta. `same_plan` is precisely the error the checkout action
    // must NOT compensate a provider swap for.
    expect(failed[0].error!.message).toContain('same_plan')

    const rows = await subscriptions()
    expect(rows).toHaveLength(2)
    const live = soleLive(rows)
    expect(live.plan_id).toBe(plans.beta)
    expect(rows.find((r) => r.plan_id === plans.alpha)!.subscription_status).toBe('canceled')

    const after = await accessByCourse()
    expect(after[COURSE_SHARED].active).toBe(true)
    expect(after[COURSE_ALPHA_ONLY].active).toBe(false)
  })
})

test.describe('subscriptions cancel-state contract', () => {
  test('no live subscription carries a cancel date it has not scheduled', async () => {
    await subscribeTo(plans.alpha, 19)

    // The acceptance criterion for #545 bug 1, over the whole table: a row born
    // with cancel_at = now() is what made the Solana crank cancel every
    // subscription at its first rollover instead of renewing it.
    const { data, error } = await admin
      .from('subscriptions')
      .select('subscription_id')
      .eq('subscription_status', 'active')
      .lte('cancel_at', new Date().toISOString())
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    const fresh = soleLive(await subscriptions())
    expect(fresh.cancel_at).toBeNull()
    expect(fresh.cancel_at_period_end).toBe(false)
  })
})
