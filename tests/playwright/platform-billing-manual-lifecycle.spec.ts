/**
 * The manual-provider platform-subscription lifecycle, end to end (issue #605).
 *
 * Manual bank transfer is the one school → platform rail that needs no external
 * credentials, so it is the only one that can guard this loop in CI forever.
 * Everything it exercises is shared with the crypto rails: `confirmManualPayment`
 * and `dispatchPlatformBillingEvent` write the same columns, and
 * `/api/cron/expire-platform-subscriptions` reminds, grace-windows and downgrades
 * every provider with `selfManagedPeriod` — `manual` among them. A regression
 * caught here is a regression on Binance Pay and Solana too.
 *
 * What it covers:
 *   request → super admin confirms in the real UI → plan active, tenant billing
 *   columns written, revenue split rewritten to the plan's fee, features unlock;
 *   the reject path; a renewal extending the period rather than restarting it;
 *   and the lapse ladder (reminder → grace → downgrade to free), including the
 *   pause while a renewal request is still open and the idempotency of a replay.
 *
 * Runs against a DEDICATED tenant rather than a seeded one. The default and
 * code-academy tenants are load-bearing for a dozen other specs — a test that
 * moves `tenants.plan` on them is a test that breaks its neighbours under CI's
 * `fullyParallel`.
 *
 * Not covered here, deliberately: the school-facing request form. It is a
 * base-ui dialog whose submit does not reliably fire under headless Playwright
 * (see the `clickByText` note in platform-billing-provider-choice.spec.ts, which
 * owns that surface). This spec starts from the row that form produces, so the
 * state machine behind it is pinned regardless.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { login } from './utils/auth'
import { BASE, LOCALE, ACCOUNTS } from './utils/constants'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** owner@e2etest.com — the seeded super admin (supabase/seed.sql). */
const SUPER_ADMIN_ID = 'a1000000-0000-0000-0000-000000000002'

/** Dedicated to this spec so no other spec's tenant state is disturbed. */
const QA_TENANT_ID = '00000000-0000-0000-0000-0000000006e5'
const QA_TENANT_SLUG = 'qa-manual-lifecycle'

const GRACE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const cronSecret = process.env.CRON_SECRET

function getAdmin(): SupabaseClient {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function planBySlug(admin: SupabaseClient, slug: string) {
  const { data, error } = await admin
    .from('platform_plans')
    .select('plan_id, slug, name, price_monthly, transaction_fee_percent')
    .eq('slug', slug)
    .single()
  if (error) throw new Error(`plan "${slug}" not found: ${error.message}`)
  return data
}

/**
 * The row the school's bank-transfer form produces. Written directly rather
 * than through the form for the reason in the file header; the shape mirrors
 * `requestManualPlanUpgrade` (app/actions/admin/billing.ts).
 */
async function createPendingRequest(
  admin: SupabaseClient,
  opts: {
    planId: string
    amount: number
    requestType?: 'upgrade' | 'downgrade' | 'renewal'
    status?: string
    expiresAt?: Date
    /** The note the SCHOOL attaches when it files the request (#615). */
    notes?: string
  },
) {
  const { data, error } = await admin
    .from('platform_payment_requests')
    .insert({
      tenant_id: QA_TENANT_ID,
      plan_id: opts.planId,
      requested_by: SUPER_ADMIN_ID,
      interval: 'monthly',
      amount: opts.amount,
      currency: 'usd',
      notes: opts.notes ?? null,
      status: opts.status ?? 'pending',
      request_type: opts.requestType ?? 'upgrade',
      payment_provider: 'manual',
      bank_reference: 'E2E-MANUAL-LIFECYCLE',
      expires_at: (opts.expiresAt ?? new Date(Date.now() + 14 * DAY_MS)).toISOString(),
    })
    .select('request_id')
    .single()
  if (error) throw new Error(`could not create payment request: ${error.message}`)
  return data.request_id as string
}

async function getRequest(admin: SupabaseClient, requestId: string) {
  const { data } = await admin
    .from('platform_payment_requests')
    .select('status, notes, admin_notes, confirmed_by, confirmed_at')
    .eq('request_id', requestId)
    .single()
  return data
}

async function getSubscription(admin: SupabaseClient) {
  const { data } = await admin
    .from('platform_subscriptions')
    .select(
      'plan_id, status, payment_provider, interval, current_period_start, current_period_end, cancel_at_period_end, canceled_at, grace_period_end, renewal_reminder_sent_at',
    )
    .eq('tenant_id', QA_TENANT_ID)
    .maybeSingle()
  return data
}

async function getTenant(admin: SupabaseClient) {
  const { data } = await admin
    .from('tenants')
    .select('plan, billing_status, billing_period_end')
    .eq('id', QA_TENANT_ID)
    .single()
  return data
}

async function getSplit(admin: SupabaseClient) {
  const { data } = await admin
    .from('revenue_splits')
    .select('platform_percentage, school_percentage')
    .eq('tenant_id', QA_TENANT_ID)
    .maybeSingle()
  return data
}

/** Put the tenant back on free with no subscription and no open requests. */
async function resetTenant(admin: SupabaseClient) {
  await admin.from('platform_payment_requests').delete().eq('tenant_id', QA_TENANT_ID)
  await admin.from('platform_subscriptions').delete().eq('tenant_id', QA_TENANT_ID)
  await admin.from('revenue_splits').delete().eq('tenant_id', QA_TENANT_ID)
  await admin
    .from('tenants')
    .update({ plan: 'free', billing_status: 'free', billing_period_end: null, access_cutoff_at: null })
    .eq('id', QA_TENANT_ID)
}

/**
 * The action buttons are `@/components/ui/button`, i.e. base-ui — Playwright's
 * synthesized click lands on them unreliably, so dispatch a real DOM click the
 * way the other specs in this directory do.
 */
async function domClick(page: import('@playwright/test').Page, selector: string) {
  await page.waitForSelector(selector)
  await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (!el) throw new Error(`no element matching ${sel}`)
    el.click()
  }, selector)
}

/**
 * The request list. Always the "all" tab: the default tab filters to the open
 * statuses, so a row would vanish on confirm instead of changing state, and the
 * assertions could not tell "confirmed" from "never rendered".
 */
async function openRequestList(page: import('@playwright/test').Page, requestId: string) {
  await page.goto(`${BASE}/${LOCALE}/platform/billing?tab=all`)
  await page.waitForSelector('[data-testid="platform-billing-page"]')
  const rowSelector = `[data-testid="billing-request-row"][data-request-id="${requestId}"]`
  await expect(page.locator(rowSelector)).toBeVisible()
  return rowSelector
}

async function confirmInUi(page: import('@playwright/test').Page, requestId: string) {
  const rowSelector = await openRequestList(page, requestId)
  await domClick(page, `${rowSelector} [data-testid="confirm-payment-btn"]`)
  await expect(page.locator(rowSelector)).toHaveAttribute('data-status', 'confirmed', {
    timeout: 20_000,
  })
}

async function rejectInUi(
  page: import('@playwright/test').Page,
  requestId: string,
  reason: string,
) {
  const rowSelector = await openRequestList(page, requestId)
  await domClick(page, `${rowSelector} [data-testid="reject-payment-btn"]`)

  const dialog = page.getByTestId('reject-payment-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('reject-reason-input').fill(reason)
  await domClick(page, '[data-testid="confirm-reject-btn"]')

  await expect(page.locator(rowSelector)).toHaveAttribute('data-status', 'rejected', {
    timeout: 20_000,
  })
}

/** GET the expiry cron the way GitHub Actions does. */
async function runExpiryCron(request: import('@playwright/test').APIRequestContext) {
  const res = await request.get(`${BASE}/api/cron/expire-platform-subscriptions`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as {
    success: boolean
    requestsExpired: number
    reminded: number
    graceStarted: number
    downgraded: number
    canceled: number
    skippedPendingRenewal: number
  }
}

/* ------------------------------------------------------------------ */
/*  Suite                                                              */
/* ------------------------------------------------------------------ */

// Every test moves the same tenant through the same state machine, so they must
// not interleave even when CI runs fullyParallel.
test.describe.configure({ mode: 'serial' })

test.describe('platform billing — manual provider lifecycle (#605)', () => {
  test.beforeAll(async () => {
    const admin = getAdmin()
    const { error } = await admin.from('tenants').upsert(
      {
        id: QA_TENANT_ID,
        slug: QA_TENANT_SLUG,
        name: 'QA Manual Lifecycle',
        plan: 'free',
        status: 'active',
        billing_status: 'free',
      },
      { onConflict: 'id' },
    )
    if (error) throw new Error(`could not create QA tenant: ${error.message}`)
    await resetTenant(admin)
  })

  test.afterAll(async () => {
    const admin = getAdmin()
    await resetTenant(admin)
    await admin.from('tenants').delete().eq('id', QA_TENANT_ID)
  })

  test.beforeEach(async ({}, testInfo) => {
    // The DB state is shared, so this must not run once per Playwright project.
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
    await resetTenant(getAdmin())
  })

  test('a confirmed bank transfer activates the plan and rewrites the revenue split', async ({
    page,
  }) => {
    const admin = getAdmin()
    const starter = await planBySlug(admin, 'starter')
    const requestId = await createPendingRequest(admin, {
      planId: starter.plan_id,
      amount: starter.price_monthly,
    })

    await login(page, ACCOUNTS.superAdmin.email, ACCOUNTS.superAdmin.password, BASE)
    await confirmInUi(page, requestId)

    const request = await getRequest(admin, requestId)
    expect(request?.status).toBe('confirmed')
    expect(request?.confirmed_by).toBe(SUPER_ADMIN_ID)
    expect(request?.confirmed_at).not.toBeNull()

    const sub = await getSubscription(admin)
    expect(sub?.status).toBe('active')
    expect(sub?.payment_provider).toBe('manual')
    expect(sub?.interval).toBe('monthly')
    expect(sub?.plan_id).toBe(starter.plan_id)
    // #545: a fresh paid period must carry no scheduled cancel and no grace.
    expect(sub?.cancel_at_period_end).toBe(false)
    expect(sub?.canceled_at).toBeNull()
    expect(sub?.grace_period_end).toBeNull()
    expect(sub?.renewal_reminder_sent_at).toBeNull()

    // A month of access, not a NULL that never lapses and shows no next payment.
    const periodEnd = new Date(sub!.current_period_end as string).getTime()
    expect(periodEnd).toBeGreaterThan(Date.now() + 27 * DAY_MS)
    expect(periodEnd).toBeLessThan(Date.now() + 32 * DAY_MS)

    const tenant = await getTenant(admin)
    expect(tenant?.plan).toBe('starter')
    expect(tenant?.billing_status).toBe('active')
    // The tenant's own copy of the period must agree with the subscription's —
    // the billing header reads this one.
    expect(tenant?.billing_period_end).not.toBeNull()
    expect(new Date(tenant!.billing_period_end as string).getTime()).toBe(periodEnd)

    // The school's transaction fee follows the plan it just bought.
    const split = await getSplit(admin)
    expect(Number(split?.platform_percentage)).toBe(Number(starter.transaction_fee_percent))
    expect(Number(split?.school_percentage)).toBe(100 - Number(starter.transaction_fee_percent))
  })

  test('activation unlocks the features the new plan carries', async ({ page }) => {
    const admin = getAdmin()

    // `community` is false on free and true from starter up (supabase/seed.sql).
    const before = await admin.rpc('get_plan_features', { _tenant_id: QA_TENANT_ID })
    expect(before.error, before.error?.message).toBeNull()
    expect(before.data?.features?.community).toBe(false)

    const starter = await planBySlug(admin, 'starter')
    const requestId = await createPendingRequest(admin, {
      planId: starter.plan_id,
      amount: starter.price_monthly,
    })

    await login(page, ACCOUNTS.superAdmin.email, ACCOUNTS.superAdmin.password, BASE)
    await confirmInUi(page, requestId)

    const after = await admin.rpc('get_plan_features', { _tenant_id: QA_TENANT_ID })
    expect(after.error, after.error?.message).toBeNull()
    expect(after.data?.features?.community).toBe(true)
    expect(after.data?.plan).toBe('starter')
  })

  test('a rejected transfer records the reason and leaves the plan untouched', async ({ page }) => {
    const admin = getAdmin()
    const pro = await planBySlug(admin, 'pro')
    const requestId = await createPendingRequest(admin, {
      planId: pro.plan_id,
      amount: pro.price_monthly,
      notes: 'Wire sent from our BAC account on the 3rd',
    })

    await login(page, ACCOUNTS.superAdmin.email, ACCOUNTS.superAdmin.password, BASE)
    await rejectInUi(page, requestId, 'No transfer received')

    const request = await getRequest(admin, requestId)
    expect(request?.status).toBe('rejected')
    // The super admin's reason and the school's own note are different columns
    // (#615). Reject used to write the reason over `notes`, destroying the
    // school's side of the record on the row reconciliation reads.
    expect(request?.admin_notes).toContain('No transfer received')
    expect(request?.notes).toBe('Wire sent from our BAC account on the 3rd')

    // Nothing was granted.
    expect(await getSubscription(admin)).toBeNull()
    const tenant = await getTenant(admin)
    expect(tenant?.plan).toBe('free')
    expect(tenant?.billing_status).toBe('free')
  })

  test('a confirmed transfer can no longer be rejected', async ({ page }) => {
    const admin = getAdmin()
    const starter = await planBySlug(admin, 'starter')
    const requestId = await createPendingRequest(admin, {
      planId: starter.plan_id,
      amount: starter.price_monthly,
      notes: "The school's own note",
    })

    await login(page, ACCOUNTS.superAdmin.email, ACCOUNTS.superAdmin.password, BASE)
    await confirmInUi(page, requestId)

    // The page stops offering a decision once the row is terminal — no Reject
    // button to press on a confirmed row. (The server refuses it too, even
    // called directly from a stale tab; that half is pinned in
    // tests/unit/reject-manual-payment.test.ts, which can invoke the action
    // without a button.)
    const rowSelector = `[data-testid="billing-request-row"][data-request-id="${requestId}"]`
    await expect(page.locator(rowSelector)).toHaveAttribute('data-status', 'confirmed')
    await expect(page.locator(`${rowSelector} [data-testid="reject-payment-btn"]`)).toHaveCount(0)
    await expect(page.locator(`${rowSelector} [data-testid="confirm-payment-btn"]`)).toHaveCount(0)

    // The grant the confirm produced is intact and uncontradicted.
    const request = await getRequest(admin, requestId)
    expect(request?.status).toBe('confirmed')
    expect(request?.admin_notes).toBeNull()
    expect(request?.notes).toBe("The school's own note")

    const subscription = await getSubscription(admin)
    expect(subscription?.status).toBe('active')
    const tenant = await getTenant(admin)
    expect(tenant?.plan).toBe('starter')
  })

  test('a confirmed renewal extends the paid period instead of restarting it', async ({ page }) => {
    const admin = getAdmin()
    const starter = await planBySlug(admin, 'starter')

    // A subscription with 10 days still to run.
    const currentEnd = new Date(Date.now() + 10 * DAY_MS)
    await admin.from('platform_subscriptions').insert({
      tenant_id: QA_TENANT_ID,
      plan_id: starter.plan_id,
      status: 'active',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: new Date(Date.now() - 20 * DAY_MS).toISOString(),
      current_period_end: currentEnd.toISOString(),
      cancel_at_period_end: false,
    })
    await admin
      .from('tenants')
      .update({ plan: 'starter', billing_status: 'active', billing_period_end: currentEnd.toISOString() })
      .eq('id', QA_TENANT_ID)

    const requestId = await createPendingRequest(admin, {
      planId: starter.plan_id,
      amount: starter.price_monthly,
      requestType: 'renewal',
    })

    await login(page, ACCOUNTS.superAdmin.email, ACCOUNTS.superAdmin.password, BASE)
    await confirmInUi(page, requestId)

    const sub = await getSubscription(admin)
    const newEnd = new Date(sub!.current_period_end as string).getTime()
    // Paying early must not cost the school the 10 days it had left: the new
    // period runs from the old end, not from today.
    expect(newEnd).toBeGreaterThan(currentEnd.getTime() + 27 * DAY_MS)
    expect(sub?.status).toBe('active')
  })

  test('the cron opens a grace window when a self-managed period lapses', async ({ request }) => {
    test.skip(!cronSecret, 'CRON_SECRET is not set in .env.local')
    const admin = getAdmin()
    const starter = await planBySlug(admin, 'starter')

    const lapsedEnd = new Date(Date.now() - 1 * DAY_MS)
    await admin.from('platform_subscriptions').insert({
      tenant_id: QA_TENANT_ID,
      plan_id: starter.plan_id,
      status: 'active',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: new Date(Date.now() - 31 * DAY_MS).toISOString(),
      current_period_end: lapsedEnd.toISOString(),
      cancel_at_period_end: false,
    })
    await admin
      .from('tenants')
      .update({ plan: 'starter', billing_status: 'active' })
      .eq('id', QA_TENANT_ID)

    const result = await runExpiryCron(request)
    expect(result.graceStarted).toBeGreaterThanOrEqual(1)

    const sub = await getSubscription(admin)
    expect(sub?.status).toBe('past_due')
    expect(sub?.grace_period_end).not.toBeNull()
    const grace = new Date(sub!.grace_period_end as string).getTime()
    expect(grace).toBeGreaterThan(Date.now() + (GRACE_DAYS - 1) * DAY_MS)

    // Still on the plan during grace — dunning is not a downgrade.
    const tenant = await getTenant(admin)
    expect(tenant?.plan).toBe('starter')
    expect(tenant?.billing_status).toBe('past_due')
  })

  test('the cron downgrades to free once the grace window closes', async ({ request }) => {
    test.skip(!cronSecret, 'CRON_SECRET is not set in .env.local')
    const admin = getAdmin()
    const starter = await planBySlug(admin, 'starter')
    const free = await planBySlug(admin, 'free')

    await admin.from('platform_subscriptions').insert({
      tenant_id: QA_TENANT_ID,
      plan_id: starter.plan_id,
      status: 'past_due',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: new Date(Date.now() - 40 * DAY_MS).toISOString(),
      current_period_end: new Date(Date.now() - 10 * DAY_MS).toISOString(),
      grace_period_end: new Date(Date.now() - 1 * DAY_MS).toISOString(),
      cancel_at_period_end: false,
    })
    await admin
      .from('tenants')
      .update({ plan: 'starter', billing_status: 'past_due' })
      .eq('id', QA_TENANT_ID)

    const result = await runExpiryCron(request)
    expect(result.downgraded).toBeGreaterThanOrEqual(1)

    const sub = await getSubscription(admin)
    expect(sub?.status).toBe('canceled')

    const tenant = await getTenant(admin)
    expect(tenant?.plan).toBe('free')
    expect(tenant?.billing_status).toBe('free')
    expect(tenant?.billing_period_end).toBeNull()

    // Back to the free plan's fee — the school keeps selling, we take the free cut.
    const split = await getSplit(admin)
    expect(Number(split?.platform_percentage)).toBe(Number(free.transaction_fee_percent))

    // Idempotent: a second pass has nothing left to do for this tenant.
    const replay = await runExpiryCron(request)
    expect(replay.success).toBe(true)
    expect((await getTenant(admin))?.plan).toBe('free')
  })

  test('the cron holds the downgrade while a renewal request is still open', async ({ request }) => {
    test.skip(!cronSecret, 'CRON_SECRET is not set in .env.local')
    const admin = getAdmin()
    const starter = await planBySlug(admin, 'starter')

    await admin.from('platform_subscriptions').insert({
      tenant_id: QA_TENANT_ID,
      plan_id: starter.plan_id,
      status: 'past_due',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: new Date(Date.now() - 40 * DAY_MS).toISOString(),
      current_period_end: new Date(Date.now() - 10 * DAY_MS).toISOString(),
      grace_period_end: new Date(Date.now() - 1 * DAY_MS).toISOString(),
      cancel_at_period_end: false,
    })
    await admin
      .from('tenants')
      .update({ plan: 'starter', billing_status: 'past_due' })
      .eq('id', QA_TENANT_ID)

    // The school has paid by transfer and is waiting on a super admin. Cutting
    // it off now would be cutting off money already sent.
    await createPendingRequest(admin, {
      planId: starter.plan_id,
      amount: starter.price_monthly,
      requestType: 'renewal',
    })

    const result = await runExpiryCron(request)
    expect(result.skippedPendingRenewal).toBeGreaterThanOrEqual(1)

    const tenant = await getTenant(admin)
    expect(tenant?.plan).toBe('starter')
  })

  test('the cron expires a request that outlived its TTL, which unblocks the downgrade', async ({
    request,
  }) => {
    test.skip(!cronSecret, 'CRON_SECRET is not set in .env.local')
    const admin = getAdmin()
    const starter = await planBySlug(admin, 'starter')

    await admin.from('platform_subscriptions').insert({
      tenant_id: QA_TENANT_ID,
      plan_id: starter.plan_id,
      status: 'past_due',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: new Date(Date.now() - 40 * DAY_MS).toISOString(),
      current_period_end: new Date(Date.now() - 10 * DAY_MS).toISOString(),
      grace_period_end: new Date(Date.now() - 1 * DAY_MS).toISOString(),
      cancel_at_period_end: false,
    })
    await admin
      .from('tenants')
      .update({ plan: 'starter', billing_status: 'past_due' })
      .eq('id', QA_TENANT_ID)

    // An open renewal request that expired yesterday: phase 0 must retire it in
    // the same pass, so phase 3 is not paused by a promise nobody kept.
    const staleId = await createPendingRequest(admin, {
      planId: starter.plan_id,
      amount: starter.price_monthly,
      requestType: 'renewal',
      expiresAt: new Date(Date.now() - 1 * DAY_MS),
    })

    const result = await runExpiryCron(request)
    expect(result.requestsExpired).toBeGreaterThanOrEqual(1)
    expect((await getRequest(admin, staleId))?.status).toBe('expired')
    expect(result.downgraded).toBeGreaterThanOrEqual(1)
    expect((await getTenant(admin))?.plan).toBe('free')
  })
})
