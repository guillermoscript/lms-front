/**
 * Tenant bans (#892) — a banned member cannot get back into the school, and
 * can once an admin lifts the ban.
 *
 * Runs on Code Academy with one throwaway student per run
 * (`ban892-<run>@e2etest.com`), removed in `afterAll` (stale ones swept in
 * `beforeAll`).
 *
 *   1. admin bans the member from the user detail page, with a reason → the
 *      row is `banned` with `banned_at`/`banned_by`/`ban_reason`, and the
 *      users list shows the Banned badge.
 *   2. the member, still signed in, is sent to /join-school, which says they
 *      were removed and offers no join form and no auto-join — a loop-free
 *      dead end — even with a pending invitation addressed to them.
 *   3. the database refuses every other way back: a service-role UPDATE to
 *      `active` or `removed` (what any join path forgetting to look would do)
 *      dies on the `guard_tenant_ban` trigger (LM002), and the row stays banned.
 *   4. the banned seat is not counted against the plan.
 *   5. admin lifts the ban in the UI → the row is `removed` (not `active`),
 *      the member rejoins through /join-school and lands on the dashboard.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TENANT_BASE, LOCALE, ACCOUNTS } from './utils/constants'
import { login, loginAsNonMember as loginNonMember } from './utils/auth'
import { getServiceRoleClient, CODE_ACADEMY_TENANT } from './utils/seed-state'

const BASE = TENANT_BASE
const RUN = Date.now()
const PREFIX = 'ban892-'
const MEMBER = { name: 'Ban Test 892', email: `${PREFIX}${RUN}@e2etest.com`, password: 'password123' }
const REASON = `E2E reason ${RUN}`

let memberId = ''

async function sweep(admin: SupabaseClient) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const ids = (data?.users ?? [])
    .filter((u) => u.email?.startsWith(PREFIX) && u.email.endsWith('@e2etest.com'))
    .map((u) => u.id)
  for (const id of ids) {
    await admin.from('gamification_profiles').delete().eq('user_id', id)
    await admin.from('tenant_users').delete().eq('user_id', id)
    await admin.auth.admin.deleteUser(id)
  }
  await admin.from('tenant_invitations').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('email', `${PREFIX}%`)
}

async function membership(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('tenant_users')
    .select('status, role, banned_at, banned_by, ban_reason')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('user_id', memberId)
    .single()
  if (error) throw new Error(`tenant_users: ${error.message}`)
  return data
}

/** base-ui buttons intermittently swallow Playwright clicks; click in-page. */
async function domClick(target: Locator) {
  await target.first().waitFor({ state: 'visible', timeout: 30_000 })
  await target.first().evaluate((el) => (el as HTMLElement).click())
}

async function openMenuItem(page: Page, testId: string) {
  await expect(async () => {
    await domClick(page.getByRole('button', { name: 'User actions' }))
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  await domClick(page.getByTestId(testId))
}

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  await sweep(admin)
  const { data, error } = await admin.auth.admin.createUser({
    email: MEMBER.email,
    password: MEMBER.password,
    email_confirm: true,
    user_metadata: { full_name: MEMBER.name },
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  memberId = data.user.id
  const { error: tuError } = await admin
    .from('tenant_users')
    .upsert(
      { tenant_id: CODE_ACADEMY_TENANT, user_id: memberId, role: 'student', status: 'active' },
      { onConflict: 'tenant_id,user_id' }
    )
  if (tuError) throw new Error(`tenant_users: ${tuError.message}`)
})

test.afterAll(async () => {
  await sweep(getServiceRoleClient())
})

test.describe.serial('Tenant ban (#892)', () => {
  test('admin bans a member from the detail page, with a reason', async ({ page }) => {
    const admin = getServiceRoleClient()
    await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, BASE)

    await page.goto(`${BASE}/${LOCALE}/dashboard/admin/users/${memberId}`, { waitUntil: 'domcontentloaded' })
    await openMenuItem(page, 'ban-action')
    const dialog = page.getByTestId('ban-dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await dialog.getByRole('textbox').fill(REASON)
    await domClick(page.getByTestId('ban-confirm'))

    await expect(page.getByTestId('user-detail-banned')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('user-detail-banned')).toContainText(REASON)

    const row = await membership(admin)
    expect(row.status).toBe('banned')
    expect(row.ban_reason).toBe(REASON)
    expect(row.banned_at).not.toBeNull()
    expect(row.banned_by).not.toBeNull()

    // The list keeps the member visible, flagged.
    await page.goto(`${BASE}/${LOCALE}/dashboard/admin/users`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('users-page').filter({ visible: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('row', { name: new RegExp(MEMBER.email, 'i') }).getByTestId('user-status-banned')).toBeVisible()
  })

  test('banned member sees the removed notice, no join form, even with an invitation', async ({ page }) => {
    const admin = getServiceRoleClient()
    // An invitation addressed to the banned email must stay inert.
    const { data: inviter } = await admin
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', CODE_ACADEMY_TENANT)
      .eq('role', 'admin')
      .eq('status', 'active')
      .limit(1)
      .single()
    const { error: inviteError } = await admin.from('tenant_invitations').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      email: MEMBER.email.toLowerCase(),
      role: 'teacher',
      invited_by: inviter?.user_id,
    })
    expect(inviteError, 'seeding the invitation').toBeNull()

    await loginNonMember(page, MEMBER.email, MEMBER.password, BASE)
    // Wherever login lands (dashboard -> proxy), the destination is the notice.
    await page.goto(`${BASE}/${LOCALE}/dashboard/student`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/join-school/, { timeout: 30_000 })
    await expect(page.getByTestId('join-school-banned')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('join-school-title')).toHaveCount(0)

    // Stays put: no auto-join, no bounce loop.
    await page.waitForTimeout(3_000)
    await expect(page).toHaveURL(/\/join-school/)
    await expect(page.getByTestId('join-school-banned')).toBeVisible()

    // Nothing was reinstated and the invitation was not consumed.
    expect((await membership(admin)).status).toBe('banned')
    const { data: invitation } = await admin
      .from('tenant_invitations')
      .select('status')
      .eq('tenant_id', CODE_ACADEMY_TENANT)
      .eq('email', MEMBER.email.toLowerCase())
      .single()
    expect(invitation?.status).toBe('pending')

    // Deep links bounce to the same notice.
    await page.goto(`${BASE}/${LOCALE}/dashboard/student/browse`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/join-school/, { timeout: 30_000 })
    await expect(page.getByTestId('join-school-banned')).toBeVisible()
  })

  test('the database refuses every other way back, and the seat is free', async () => {
    const admin = getServiceRoleClient()

    for (const status of ['active', 'removed']) {
      const { error } = await admin
        .from('tenant_users')
        .update({ status })
        .eq('tenant_id', CODE_ACADEMY_TENANT)
        .eq('user_id', memberId)
      expect(error?.code, `UPDATE to ${status} must hit guard_tenant_ban`).toBe('LM002')
    }
    expect((await membership(admin)).status).toBe('banned')

    // A direct, non-RPC ban without its audit column is refused too.
    const { error: checkError } = await admin
      .from('tenant_users')
      .update({ banned_at: null })
      .eq('tenant_id', CODE_ACADEMY_TENANT)
      .eq('user_id', memberId)
    expect(checkError).not.toBeNull()

    // The RPCs are not callable by a signed-in user.
    const anon = (await import('@supabase/supabase-js')).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    await anon.auth.signInWithPassword({ email: MEMBER.email, password: MEMBER.password })
    const { error: rpcError } = await anon.rpc('lift_tenant_ban', {
      _tenant_id: CODE_ACADEMY_TENANT,
      _user_id: memberId,
    })
    expect(rpcError).not.toBeNull()
    expect((await membership(admin)).status).toBe('banned')

    // Plan usage counts active students only.
    const { count } = await admin
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', CODE_ACADEMY_TENANT)
      .eq('role', 'student')
      .eq('status', 'active')
      .eq('user_id', memberId)
    expect(count).toBe(0)
  })

  test('admin lifts the ban; the member lands on removed and rejoins', async ({ page, browser }) => {
    const admin = getServiceRoleClient()
    await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, BASE)
    await page.goto(`${BASE}/${LOCALE}/dashboard/admin/users/${memberId}`, { waitUntil: 'domcontentloaded' })
    await openMenuItem(page, 'lift-ban-action')
    await domClick(page.getByRole('alertdialog').getByRole('button', { name: /lift ban/i }))

    await expect.poll(async () => (await membership(admin)).status, { timeout: 30_000 }).toBe('removed')
    const row = await membership(admin)
    expect(row.banned_at).toBeNull()
    expect(row.ban_reason).toBeNull()

    // Rejoin through the normal flow (a removed member of a single school is
    // joined on arrival, through the student-limit check).
    const context = await browser.newContext()
    const memberPage = await context.newPage()
    try {
      await loginNonMember(memberPage, MEMBER.email, MEMBER.password, BASE)
      await memberPage.goto(`${BASE}/${LOCALE}/join-school`, { waitUntil: 'domcontentloaded' })
      await memberPage.waitForURL(/\/dashboard\//, { timeout: 60_000 })
      await expect(memberPage.getByTestId('join-school-banned')).toHaveCount(0)
      await expect.poll(async () => (await membership(admin)).status, { timeout: 30_000 }).toBe('active')
    } finally {
      await context.close()
    }
  })
})
