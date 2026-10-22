/**
 * Super admin creates a school on someone's behalf (#984).
 *
 *  1. internal school for the super admin themself: success state, DB rows
 *     (billing_mode, plan, admin membership, mode log) and the school opens.
 *  2. comped school for a NEW email: pending admin invitation + comped columns;
 *     the invitee joins from the link and ends up admin of THAT school only.
 *  3. an EXISTING user's email is added as admin directly.
 *  4. a non super admin cannot open /platform/tenants/new.
 *  5. duplicate and reserved slugs show an inline slug error and create nothing.
 *  6. a failure after the tenant insert leaves no orphan tenant (a temporary
 *     trigger on tenant_invitations makes the invitation insert fail).
 *
 * Everything is created under the `qa984-<RUN>` prefix (tenants, users,
 * invitations) and swept in beforeAll/afterAll. Seeded tenants are only read.
 * The super admin's active tenant (auth app_metadata) is moved by test 1, so
 * it is restored in afterAll.
 */
import { execFileSync } from 'node:child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from './utils/test'
import { BASE, LOCALE } from './utils/constants'
import { login, loginAsSuperAdmin } from './utils/auth'
import { DAY_MS, SEEDED, getAdmin, tenantBase } from './utils/plan-gate-fixtures'
import { DEFAULT_TENANT } from './utils/seed-state'

const RUN = Date.now()
const PREFIX = 'qa984-'
const TAG = `${PREFIX}${RUN}`
const PASSWORD = 'password123'
const DB_CONTAINER = process.env.E2E_DB_CONTAINER || 'supabase_db_lms-front'
const TRIGGER_FN = 'qa984_block_invite'
const TRIGGER = 'qa984_block_invite_trg'

const SLUG = {
  internal: `${TAG}-int`,
  comped: `${TAG}-cmp`,
  existing: `${TAG}-ex`,
  orphan: `${TAG}-orp`,
}
const INVITEE_EMAIL = `${TAG}-invitee@e2etest.com`
const EXISTING_EMAIL = `${TAG}-existing@e2etest.com`
const ORPHAN_EMAIL = `${TAG}-orphan@e2etest.com`
const NAME = (kind: string) => `QA984 ${RUN} ${kind}`

test.describe.configure({ mode: 'serial' })

let ownerOriginalAppMeta: Record<string, unknown> | null = null
let ownerOriginalUserMeta: Record<string, unknown> | null = null
const created: { comped?: string; internal?: string; existing?: string } = {}

/* ------------------------------------------------------------------ */
/*  Seed / clean                                                       */
/* ------------------------------------------------------------------ */
function psql(sql: string) {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  })
}

function dropBlockTrigger() {
  try {
    psql(`DROP TRIGGER IF EXISTS ${TRIGGER} ON public.tenant_invitations; DROP FUNCTION IF EXISTS public.${TRIGGER_FN}();`)
  } catch (err) {
    console.warn('qa984: could not drop the block trigger', err)
  }
}

async function sweep(admin: SupabaseClient) {
  // Tenants by slug prefix (children cascade); belt and braces for the log.
  const { data: tenants } = await admin.from('tenants').select('id').like('slug', `${PREFIX}%`)
  for (const t of tenants ?? []) {
    await admin.from('tenant_billing_mode_log').delete().eq('tenant_id', t.id)
    await admin.from('notifications').delete().eq('tenant_id', t.id)
    await admin.from('gamification_profiles').delete().eq('tenant_id', t.id)
    const { error } = await admin.from('tenants').delete().eq('id', t.id)
    if (error) console.warn(`qa984 cleanup: delete tenant ${t.id}: ${error.message}`)
  }
  // Rows keyed by the typed names (a failed create must leave none, but sweep anyway).
  await admin.from('tenants').delete().like('name', 'QA984 %')
  await admin.from('tenant_invitations').delete().like('email', `${PREFIX}%`)

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of list?.users ?? []) {
    if (!u.email?.startsWith(PREFIX)) continue
    await admin.from('tenant_users').delete().eq('user_id', u.id)
    await admin.from('gamification_profiles').delete().eq('user_id', u.id)
    const { error } = await admin.auth.admin.deleteUser(u.id)
    if (error) console.warn(`qa984 cleanup: deleteUser ${u.email}: ${error.message}`)
  }
}

async function restoreOwnerTenant(admin: SupabaseClient) {
  if (!ownerOriginalAppMeta) return
  const { error } = await admin.auth.admin.updateUserById(SEEDED.owner.id, {
    app_metadata: { tenant_id: ownerOriginalAppMeta.tenant_id ?? DEFAULT_TENANT },
    user_metadata: { ...(ownerOriginalUserMeta ?? {}), preferred_tenant_id: (ownerOriginalUserMeta as { preferred_tenant_id?: string } | null)?.preferred_tenant_id ?? null },
  })
  if (error) console.warn(`qa984 cleanup: could not restore owner tenant: ${error.message}`)
}

test.beforeAll(async () => {
  const admin = getAdmin()
  dropBlockTrigger()
  await sweep(admin)
  const { data } = await admin.auth.admin.getUserById(SEEDED.owner.id)
  ownerOriginalAppMeta = { ...(data?.user?.app_metadata ?? {}) }
  ownerOriginalUserMeta = { ...(data?.user?.user_metadata ?? {}) }
})

test.afterAll(async () => {
  const admin = getAdmin()
  dropBlockTrigger()
  await sweep(admin)
  await restoreOwnerTenant(admin)
})

/* ------------------------------------------------------------------ */
/*  Page helpers                                                       */
/* ------------------------------------------------------------------ */
async function fillSettled(page: Page, target: string | Locator, value: string) {
  const field = typeof target === 'string' ? page.getByTestId(target) : target
  await field.waitFor({ state: 'visible', timeout: 30_000 })
  await expect
    .poll(
      async () => {
        await field.fill(value)
        await page.waitForTimeout(400)
        return field.inputValue()
      },
      { timeout: 30_000, intervals: [500, 1000] },
    )
    .toBe(value)
}

async function domClick(page: Page, target: string | Locator) {
  const loc = typeof target === 'string' ? page.getByTestId(target) : target
  await loc.first().waitFor({ state: 'visible', timeout: 30_000 })
  await loc.first().evaluate((el) => (el as HTMLElement).click())
}

/** base-ui Select: open the trigger and pick an option, retrying until it shows. */
async function pickOption(page: Page, triggerTestId: string, optionName: string) {
  const trigger = page.getByTestId(triggerTestId)
  if (new RegExp(`^${optionName}$`, 'i').test(((await trigger.textContent()) ?? '').trim())) return
  const option = page.getByRole('option', { name: optionName, exact: true })
  await expect(async () => {
    if (!(await option.isVisible())) await trigger.click({ timeout: 5_000 })
    await expect(option).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000, intervals: [500, 1000] })
  await option.click({ timeout: 10_000 })
  await expect(trigger).toContainText(new RegExp(optionName, 'i'))
}

async function openForm(page: Page) {
  await page.goto(`${BASE}/${LOCALE}/platform/tenants/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('create-school-form')).toBeVisible({ timeout: 60_000 })
  // Wait for hydration of the controlled inputs before typing.
  await expect
    .poll(() => page.getByTestId('create-school-name').evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))), {
      timeout: 60_000,
    })
    .toBe(true)
}

async function fillBasics(page: Page, o: { name: string; slug: string; ownerEmail?: string }) {
  await fillSettled(page, 'create-school-name', o.name)
  await fillSettled(page, 'create-school-slug', o.slug)
  if (o.ownerEmail) await fillSettled(page, 'create-school-owner-email', o.ownerEmail)
}

async function submit(page: Page) {
  await domClick(page, 'create-school-submit')
}

async function tenantBySlug(admin: SupabaseClient, slug: string) {
  const { data, error } = await admin.from('tenants').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(`tenants: ${error.message}`)
  return data
}

async function userIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return data?.users.find((u) => u.email === email)?.id ?? null
}

async function membershipsOf(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.from('tenant_users').select('tenant_id, role, status').eq('user_id', userId)
  if (error) throw new Error(`tenant_users: ${error.message}`)
  return data ?? []
}

async function tenantCount(admin: SupabaseClient) {
  const { count, error } = await admin.from('tenants').select('id', { count: 'exact', head: true })
  if (error) throw new Error(`tenants count: ${error.message}`)
  return count ?? 0
}

async function acceptAsInvitee(browser: Browser, joinUrl: string): Promise<{ context: BrowserContext; page: Page; arrived: boolean }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(joinUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/auth\/login\?/, { timeout: 60_000 })
  const signupLink = page.getByTestId('login-signup-link')
  await expect(signupLink).toBeVisible({ timeout: 30_000 })
  await signupLink.click()
  await page.waitForURL(/\/auth\/sign-up\?/, { timeout: 30_000 })
  await fillSettled(page, 'signup-name', 'QA984 Invitee')
  await fillSettled(page, 'signup-email', INVITEE_EMAIL)
  await fillSettled(page, 'signup-password', PASSWORD)
  await domClick(page, 'signup-submit')
  // Dev-server noise ('enqueueModel' Flight decode crash) can strand the client
  // on /join-school behind the error boundary before the join runs (the same
  // happens to invitations-send-accept.spec.ts locally). Reloading the join
  // page retries the join; the DB assertions in the caller decide the outcome.
  let arrived = false
  for (let attempt = 0; attempt < 3 && !arrived; attempt++) {
    arrived = await page
      .waitForURL(/\/dashboard(?:[/?#]|$)/, { timeout: attempt === 0 ? 60_000 : 45_000 })
      .then(() => true)
      .catch(() => false)
    if (!arrived) {
      console.log(`qa984: join attempt ${attempt + 1} stuck at ${page.url()}, reloading join page`)
      await page.goto(joinUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
    }
  }
  return { context, page, arrived }
}

/* ================================================================== */
test.describe('create school on behalf of someone (#984)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test('1. super admin creates an internal school for themself', async ({ page, browser }) => {
    test.setTimeout(300_000)
    const admin = getAdmin()
    await loginAsSuperAdmin(page)
    await openForm(page)
    await fillBasics(page, { name: NAME('internal'), slug: SLUG.internal })
    await pickOption(page, 'billing-mode-select', 'internal')
    await expect(page.getByTestId('billing-mode-plan-pinned')).toContainText(/enterprise/i)
    await expect(page.getByTestId('create-school-owner-email')).toBeDisabled()
    await fillSettled(page, 'billing-mode-reason', 'E2E #984 internal school')
    await submit(page)

    const success = page.getByTestId('create-school-success')
    await expect(success).toBeVisible({ timeout: 90_000 })
    await expect(page.getByTestId('create-school-site-url')).toContainText(`${SLUG.internal}.lvh.me`)
    await expect(page.getByTestId('create-school-owner-status')).toContainText(/you are the admin/i)

    const t = await tenantBySlug(admin, SLUG.internal)
    expect(t).toBeTruthy()
    created.internal = t!.id
    expect(t).toMatchObject({ billing_mode: 'internal', plan: 'enterprise', name: NAME('internal'), status: 'active' })
    const { data: member } = await admin
      .from('tenant_users')
      .select('role, status')
      .eq('tenant_id', t!.id)
      .eq('user_id', SEEDED.owner.id)
      .single()
    expect(member).toMatchObject({ role: 'admin', status: 'active' })
    const { data: log } = await admin.from('tenant_billing_mode_log').select('new_mode, reason').eq('tenant_id', t!.id)
    expect(log ?? []).not.toHaveLength(0)
    expect(log!.map((r) => r.new_mode)).toContain('internal')

    // The school is reachable on its subdomain and the super admin is its admin.
    const ctx = await browser.newContext()
    const schoolPage = await ctx.newPage()
    try {
      const base = tenantBase(SLUG.internal)
      await login(schoolPage, SEEDED.owner.email, SEEDED.owner.password, base)
      await schoolPage.goto(`${base}/${LOCALE}/dashboard/admin`, { waitUntil: 'domcontentloaded' })
      await expect(schoolPage).toHaveURL(/\/dashboard\/admin/, { timeout: 60_000 })
    } finally {
      await ctx.close()
    }
  })

  test('2. comped school for a new email: invitation, then the invitee joins as admin of that school only', async ({
    page,
    browser,
  }) => {
    test.setTimeout(600_000)
    const admin = getAdmin()
    await loginAsSuperAdmin(page)
    await openForm(page)
    await fillBasics(page, { name: NAME('comped'), slug: SLUG.comped, ownerEmail: INVITEE_EMAIL })
    await pickOption(page, 'billing-mode-select', 'comped')
    await pickOption(page, 'billing-mode-plan', 'enterprise')
    const until = new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10)
    await fillSettled(page, 'billing-mode-until', until)
    await fillSettled(page, 'billing-mode-fee', '4')
    await fillSettled(page, 'billing-mode-reason', 'E2E #984 comped school')
    await submit(page)

    await expect(page.getByTestId('create-school-success')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByTestId('create-school-owner-status')).toContainText(INVITEE_EMAIL)
    const joinUrl = await page.getByTestId('create-school-join-url').inputValue()
    expect(new URL(joinUrl).hostname).toBe(`${SLUG.comped}.lvh.me`)
    expect(new URL(joinUrl).pathname.replace(/^\/(en|es)/, '')).toBe('/join-school')

    const t = await tenantBySlug(admin, SLUG.comped)
    expect(t).toBeTruthy()
    created.comped = t!.id
    expect(t).toMatchObject({ billing_mode: 'comped', plan: 'enterprise', comped_by: SEEDED.owner.id })
    expect(Number(t!.fee_percent_override)).toBe(4)
    expect(t!.comped_until).toBeTruthy()
    const { data: inv } = await admin
      .from('tenant_invitations')
      .select('role, status')
      .eq('tenant_id', t!.id)
      .eq('email', INVITEE_EMAIL)
      .single()
    expect(inv).toMatchObject({ role: 'admin', status: 'pending' })

    const { context, page: inviteePage, arrived } = await acceptAsInvitee(browser, joinUrl)
    try {
      const landed = inviteePage.url()
      test.info().annotations.push({ type: 'note', description: `invitee landed on ${landed} right after sign-up` })
      console.log(`qa984: invitee landed on ${landed}`)

      const userId = (await userIdByEmail(admin, INVITEE_EMAIL))!
      expect(userId).toBeTruthy()
      const memberships = await membershipsOf(admin, userId)
      expect(memberships, JSON.stringify(memberships)).toHaveLength(1)
      expect(memberships[0]).toMatchObject({ tenant_id: t!.id, role: 'admin', status: 'active' })
      const { data: after } = await admin
        .from('tenant_invitations')
        .select('status, accepted_at')
        .eq('tenant_id', t!.id)
        .eq('email', INVITEE_EMAIL)
        .single()
      expect(after?.status).toBe('accepted')

      // Wherever the post-join redirect settled, the admin dashboard must load.
      const base = tenantBase(SLUG.comped)
      await inviteePage.goto(`${base}/${LOCALE}/dashboard/admin`, { waitUntil: 'domcontentloaded' })
      await expect(inviteePage).toHaveURL(/\/dashboard\/admin/, { timeout: 60_000 })
      await expect(inviteePage.locator('main').first()).toBeVisible({ timeout: 60_000 })
      // Final landing right after join (observed above) should be the admin dashboard.
      if (arrived) expect(landed, 'post-join landing for an invited admin').toMatch(/\/dashboard\/admin/)
    } finally {
      await context.close()
    }
  })

  test('3. an existing user is added as admin straight away', async ({ page }) => {
    test.setTimeout(300_000)
    const admin = getAdmin()
    const { data: u, error } = await admin.auth.admin.createUser({
      email: EXISTING_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`createUser: ${error.message}`)

    await loginAsSuperAdmin(page)
    await openForm(page)
    await fillBasics(page, { name: NAME('existing'), slug: SLUG.existing, ownerEmail: EXISTING_EMAIL })
    await submit(page)

    await expect(page.getByTestId('create-school-success')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByTestId('create-school-owner-status')).toContainText(/added as admin/i)
    await expect(page.getByTestId('create-school-owner-status')).toContainText(EXISTING_EMAIL)
    await expect(page.getByTestId('create-school-join-url')).toHaveCount(0)

    const t = await tenantBySlug(admin, SLUG.existing)
    expect(t).toBeTruthy()
    created.existing = t!.id
    expect(t).toMatchObject({ billing_mode: 'paid' })
    const { data: member } = await admin
      .from('tenant_users')
      .select('role, status')
      .eq('tenant_id', t!.id)
      .eq('user_id', u.user.id)
      .single()
    expect(member).toMatchObject({ role: 'admin', status: 'active' })
    const { data: invs } = await admin.from('tenant_invitations').select('id').eq('tenant_id', t!.id)
    expect(invs ?? []).toHaveLength(0)
  })

  test('4. a non super admin cannot open the create-school page', async ({ page }) => {
    await login(page, SEEDED.student.email, SEEDED.student.password)
    await page.goto(`${BASE}/${LOCALE}/platform/tenants/new`, { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/platform/)
    await expect(page.getByTestId('create-school-form')).toHaveCount(0)
    await expect(page.getByTestId('platform-tenant-new-page')).toHaveCount(0)
  })

  test('5. duplicate and reserved slugs show an inline slug error and create nothing', async ({ page }) => {
    test.setTimeout(300_000)
    const admin = getAdmin()
    await loginAsSuperAdmin(page)
    await openForm(page)

    const before = await tenantCount(admin)
    const defaultBefore = await tenantBySlug(admin, 'default')
    expect(defaultBefore, 'seeded default tenant exists').toBeTruthy()

    // Duplicate (case-insensitive too).
    await fillBasics(page, { name: NAME('dup'), slug: 'default', ownerEmail: `${TAG}-dup@e2etest.com` })
    await submit(page)
    const slugError = page.locator('#create-school-slug-error')
    await expect(slugError).toBeVisible({ timeout: 60_000 })
    await expect(slugError).toContainText(/already taken/i)
    await expect(page.getByTestId('create-school-success')).toHaveCount(0)

    // Reserved.
    for (const reserved of ['www', 'admin']) {
      await fillSettled(page, 'create-school-slug', reserved)
      await submit(page)
      await expect(slugError).toContainText(/reserved/i, { timeout: 60_000 })
      await expect(page.getByTestId('create-school-success')).toHaveCount(0)
    }

    expect(await tenantCount(admin)).toBe(before)
    const { data: named } = await admin.from('tenants').select('id').eq('name', NAME('dup'))
    expect(named ?? []).toHaveLength(0)
    const defaultAfter = await tenantBySlug(admin, 'default')
    expect(defaultAfter).toEqual(defaultBefore)
    expect(await tenantBySlug(admin, 'www')).toBeNull()
    expect(await tenantBySlug(admin, 'admin')).toBeNull()
  })

  test('6. a failure after the tenant insert leaves no orphan tenant', async ({ page }) => {
    test.setTimeout(300_000)
    const admin = getAdmin()
    try {
      psql(`
        CREATE OR REPLACE FUNCTION public.${TRIGGER_FN}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.email LIKE '${PREFIX}%' THEN RAISE EXCEPTION 'qa984 forced invitation failure'; END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER ${TRIGGER} BEFORE INSERT OR UPDATE ON public.tenant_invitations
          FOR EACH ROW EXECUTE FUNCTION public.${TRIGGER_FN}();
      `)

      await loginAsSuperAdmin(page)
      await openForm(page)
      await fillBasics(page, { name: NAME('orphan'), slug: SLUG.orphan, ownerEmail: ORPHAN_EMAIL })
      await pickOption(page, 'billing-mode-select', 'comped')
      await fillSettled(page, 'billing-mode-reason', 'E2E #984 rollback')
      await submit(page)

      const err = page.getByTestId('create-school-error')
      await expect(err).toBeVisible({ timeout: 90_000 })
      await expect(page.getByTestId('create-school-success')).toHaveCount(0)

      expect(await tenantBySlug(admin, SLUG.orphan)).toBeNull()
      const { data: named } = await admin.from('tenants').select('id').eq('name', NAME('orphan'))
      expect(named ?? []).toHaveLength(0)
      const { data: invs } = await admin.from('tenant_invitations').select('id').eq('email', ORPHAN_EMAIL)
      expect(invs ?? []).toHaveLength(0)
    } finally {
      dropBlockTrigger()
    }
  })
})
