/**
 * Invitations — an admin sends an invite, the invitee accepts and lands with
 * the right role (#673).
 *
 * Runs on Code Academy as `creator@codeacademy.com`, with one fresh invitee
 * per role per run. Everything it creates (auth users, invitation rows, the
 * teacher's course) is removed in `afterAll`; stale rows from a crashed run
 * are swept in `beforeAll` by prefix.
 *
 *   student  admin → /dashboard/admin/users → Invite → role student →
 *            "Send Email Invitation". With no mailer the panel must say the
 *            email was NOT sent and show the join link — never "Invitation
 *            sent!" with nothing sent (#676). The link points at this tenant
 *            on the scheme/port the admin is on. The invitee opens it →
 *            login (next kept) → sign-up (next kept) → /join-school → Join →
 *            /dashboard/student. Membership role = student, invitation
 *            `accepted`.
 *   teacher  same admin, role teacher, via "Copy Link" (clipboard holds the
 *            join link, the row is recorded without an email). The invitee
 *            joins and is sent to /dashboard/teacher — the invitation's role
 *            beats the default `student` — and creates a course.
 *   admin    the users table lists both new members with their role.
 *
 * Why the invitee never touches an inbox: invitation emails go through
 * Mailgun (`lib/email/send.ts`), which is unset locally and in CI, so the link
 * is taken from the dialog — the same link the email would carry.
 */
import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TENANT_BASE, LOCALE, ACCOUNTS } from './utils/constants'
import { login } from './utils/auth'
import { getServiceRoleClient, CODE_ACADEMY_TENANT } from './utils/seed-state'

const BASE = TENANT_BASE
const TENANT_NAME = 'Code Academy Pro'
const RUN = Date.now()
const INVITEE_PREFIX = 'invite673-'
const COURSE_TITLE = `[E2E] #673 Invited teacher course ${RUN}`
/** Same env the app reads (playwright.config loads .env.local for both). */
const MAILER_CONFIGURED = Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN)

type Role = 'student' | 'teacher'
interface Invitee {
  name: string
  email: string
  password: string
}
const INVITEES: Record<Role, Invitee> = {
  student: { name: 'Invited Student 673', email: `${INVITEE_PREFIX}student-${RUN}@e2etest.com`, password: 'password123' },
  teacher: { name: 'Invited Teacher 673', email: `${INVITEE_PREFIX}teacher-${RUN}@e2etest.com`, password: 'password123' },
}

const inviteeIds: Partial<Record<Role, string>> = {}
const joinUrls: Partial<Record<Role, string>> = {}

/* ------------------------------------------------------------------ */
/*  Seed / clean                                                       */
/* ------------------------------------------------------------------ */
async function inviteeUserIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return (data?.users ?? [])
    .filter((u) => u.email?.startsWith(INVITEE_PREFIX) && u.email.endsWith('@e2etest.com'))
    .map((u) => u.id)
}

async function removeInvitees(admin: SupabaseClient, ids: string[]) {
  for (const id of ids) {
    // Rows that do not cascade from auth.users first.
    await admin.from('courses').delete().eq('author_id', id)
    await admin.from('gamification_profiles').delete().eq('user_id', id)
    await admin.from('tenant_users').delete().eq('user_id', id)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) console.warn(`invitations cleanup: deleteUser ${id}: ${error.message}`)
  }
  await admin.from('tenant_invitations').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('email', `${INVITEE_PREFIX}%`)
  await admin.from('courses').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('title', '[E2E] #673%')
}

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  await removeInvitees(admin, await inviteeUserIds(admin))
})

test.afterAll(async () => {
  const admin = getServiceRoleClient()
  await removeInvitees(admin, await inviteeUserIds(admin))
})

/* ------------------------------------------------------------------ */
/*  Page helpers                                                       */
/* ------------------------------------------------------------------ */

/** Fill a React-controlled input and prove the value survived hydration. */
async function fillSettled(page: Page, target: string | Locator, value: string) {
  const field = typeof target === 'string' ? page.getByTestId(target) : target
  await field.waitFor({ state: 'visible', timeout: 30_000 })
  await expect
    .poll(
      async () => {
        await field.fill(value)
        await page.waitForTimeout(500)
        return field.inputValue()
      },
      { timeout: 30_000, intervals: [500, 1000] }
    )
    .toBe(value)
}

/** base-ui buttons intermittently swallow Playwright clicks; click in-page. */
async function domClick(page: Page, target: string | Locator) {
  const loc = typeof target === 'string' ? page.getByTestId(target) : target
  await loc.first().waitFor({ state: 'visible', timeout: 30_000 })
  await loc.first().evaluate((el) => (el as HTMLElement).click())
}

/** Click until `done()` holds — base-ui Select needs a real pointer click, sometimes two. */
async function clickUntil(target: Locator, done: () => Promise<boolean>, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    await target.click({ timeout: 10_000 }).catch(() => undefined)
    await target.page().waitForTimeout(400)
    if (await done()) return
  }
  throw new Error(`clickUntil: condition never held after ${attempts} clicks`)
}

/** Open the invite dialog on the users page and set role + email. */
async function openInviteDialog(page: Page, role: Role, email: string) {
  await page.goto(`${BASE}/${LOCALE}/dashboard/admin/users`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('users-page')).toBeVisible({ timeout: 60_000 })
  await domClick(page, 'invite-user-trigger')
  await expect(page.getByTestId('invite-user-dialog')).toBeVisible({ timeout: 30_000 })

  if (role === 'teacher') {
    const trigger = page.getByTestId('invite-role')
    const option = page.getByRole('option', { name: /^teacher$/i })
    await clickUntil(trigger, () => option.isVisible())
    await clickUntil(option, async () => !(await option.isVisible()))
    await expect(trigger).toContainText(/teacher/i)
  }
  await fillSettled(page, 'invite-email', email)
}

function expectTenantJoinUrl(url: string) {
  const parsed = new URL(url)
  expect(parsed.origin, 'join link points at this school on the scheme/port the admin is on').toBe(new URL(BASE).origin)
  expect(parsed.pathname.replace(/^\/(en|es)/, '')).toBe('/join-school')
}

async function pendingInvitation(admin: SupabaseClient, email: string) {
  const { data, error } = await admin
    .from('tenant_invitations')
    .select('id, role, status, accepted_at')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('email', email.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`tenant_invitations: ${error.message}`)
  return data
}

/**
 * The invitee's side, in its own browser context: open the join link
 * anonymously, sign up with `next` preserved, join the school.
 */
async function acceptInvitation(
  browser: Browser,
  joinUrl: string,
  invitee: Invitee
): Promise<{ context: BrowserContext; page: Page }> {
  // The `page` fixture's context records video when the project says so
  // (`human`, `human-mobile`); a hand-made context does not, so opt the
  // invitee in too — a recording of this flow without the invitee's half is
  // not much of a recording.
  const video = test.info().project.use.video
  const recording = video === 'on' || (typeof video === 'object' && video?.mode === 'on')
  const context = await browser.newContext(
    recording ? { recordVideo: { dir: test.info().outputDir, size: { width: 1280, height: 720 } } } : {}
  )
  const page = await context.newPage()

  await test.step(`${invitee.email} opens the join link and is sent to log in with the intent kept`, async () => {
    await page.goto(joinUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/auth\/login\?/, { timeout: 60_000 })
    expect(new URL(page.url()).searchParams.get('next')).toBe('/join-school')
    const signupLink = page.getByTestId('login-signup-link')
    await expect(signupLink).toBeVisible({ timeout: 30_000 })
    await signupLink.click()
    await page.waitForURL(/\/auth\/sign-up\?/, { timeout: 30_000 })
    expect(new URL(page.url()).searchParams.get('next')).toBe('/join-school')
  })

  await test.step('sign-up lands on the join page for this school', async () => {
    await fillSettled(page, 'signup-name', invitee.name)
    await fillSettled(page, 'signup-email', invitee.email)
    await fillSettled(page, 'signup-password', invitee.password)
    await domClick(page, 'signup-submit')
    await page.waitForURL(/\/join-school(?:[/?#]|$)/, { timeout: 90_000 })
    await expect(page.getByTestId('join-school-title')).toContainText(TENANT_NAME, { timeout: 60_000 })
  })

  await test.step('Join', async () => {
    const joinButton = page.getByRole('button', { name: `Join ${TENANT_NAME}` })
    await expect(joinButton).toBeVisible({ timeout: 30_000 })
    await domClick(page, joinButton)
  })

  return { context, page }
}

async function membershipOf(admin: SupabaseClient, email: string) {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = users?.users.find((u) => u.email === email)
  expect(user, `auth user for ${email}`).toBeTruthy()
  const { data, error } = await admin
    .from('tenant_users')
    .select('role, status')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .eq('user_id', user!.id)
    .maybeSingle()
  if (error) throw new Error(`tenant_users: ${error.message}`)
  return { userId: user!.id, membership: data }
}

/* ================================================================== */
/*  The journey                                                        */
/* ================================================================== */
test.describe.configure({ mode: 'serial' })

test.describe('Invitations — admin invites, invitee joins with the invited role (#673)', () => {
  test('a student invitation is honest about the email and its link works end to end', async ({ page, browser }) => {
    // A dev server cold-compiles the admin and auth routes on first visit.
    test.setTimeout(600_000)
    const admin = getServiceRoleClient()
    const invitee = INVITEES.student

    await test.step('admin sends a student invitation by email', async () => {
      await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, BASE)
      await openInviteDialog(page, 'student', invitee.email)
      await domClick(page, 'invite-send-email')

      const result = page.getByTestId('invite-result')
      await expect(result).toBeVisible({ timeout: 60_000 })
      const emailSent = (await result.getAttribute('data-email-sent')) === 'true'

      if (!MAILER_CONFIGURED) {
        // Nothing can have left the server: the panel must not say it did.
        expect(emailSent, 'dialog claims an email was sent with Mailgun unset').toBe(false)
        await expect(page.getByTestId('invite-result-title')).toContainText(/email not sent/i)
        await expect(page.getByTestId('invite-result-title')).not.toContainText(/invitation sent!/i)
        joinUrls.student = await page.getByTestId('invite-join-link').inputValue()
      } else {
        test.info().annotations.push({
          type: 'note',
          description: `Mailgun configured — dialog reported emailSent=${emailSent}`,
        })
        joinUrls.student = emailSent
          ? `${BASE}/join-school`
          : await page.getByTestId('invite-join-link').inputValue()
      }
      expectTenantJoinUrl(joinUrls.student)

      const row = await pendingInvitation(admin, invitee.email)
      expect(row).toMatchObject({ role: 'student', status: 'pending' })
    })

    const { context, page: inviteePage } = await acceptInvitation(browser, joinUrls.student!, invitee)
    try {
      await test.step('the invitee lands on the student dashboard as a student member', async () => {
        await inviteePage.waitForURL(/\/dashboard\/student(?:[/?#]|$)/, { timeout: 90_000 })

        const { userId, membership } = await membershipOf(admin, invitee.email)
        inviteeIds.student = userId
        expect(membership).toMatchObject({ role: 'student', status: 'active' })

        const row = await pendingInvitation(admin, invitee.email)
        expect(row?.status).toBe('accepted')
        expect(row?.accepted_at).toBeTruthy()
      })
    } finally {
      await context.close()
    }
  })

  test('a teacher invitation via Copy Link makes the invitee a teacher who can create a course', async ({ page, browser }) => {
    test.setTimeout(600_000)
    const admin = getServiceRoleClient()
    const invitee = INVITEES.teacher

    await test.step('admin records a teacher invitation and copies the join link', async () => {
      // `navigator.clipboard` only exists on secure origins. Locally and in CI
      // the app is plain http, Chromium refuses the grant, and the dialog falls
      // back to showing the link; over https the copy succeeds. Both are covered.
      await page
        .context()
        .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin })
        .catch(() => undefined)
      await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, BASE)
      await openInviteDialog(page, 'teacher', invitee.email)
      await page.bringToFront()
      await domClick(page, 'invite-copy-link')

      // Either the button confirms the copy, or (clipboard refused) the dialog
      // falls back to showing the link. Both hand the admin a usable link.
      const copied = page.getByTestId('invite-copy-link').filter({ hasText: /copied/i })
      const shown = page.getByTestId('invite-join-link')
      await expect(copied.or(shown).first()).toBeVisible({ timeout: 30_000 })

      let url: string | null = null
      if (await shown.count()) {
        url = await shown.inputValue()
      } else {
        url = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
      }
      expect(url, 'a join link was handed to the admin').toBeTruthy()
      joinUrls.teacher = url!
      expectTenantJoinUrl(joinUrls.teacher)

      const row = await pendingInvitation(admin, invitee.email)
      expect(row).toMatchObject({ role: 'teacher', status: 'pending' })
    })

    const { context, page: inviteePage } = await acceptInvitation(browser, joinUrls.teacher!, invitee)
    try {
      await test.step('the invitee is routed to the teacher dashboard — the invitation role beats the default', async () => {
        // JoinSchoolForm always navigates to /dashboard/student; proxy.ts reads
        // the tenant_users row and sends a teacher to /dashboard/teacher.
        await inviteePage.waitForURL(/\/dashboard\/teacher(?:[/?#]|$)/, { timeout: 90_000 })

        const { userId, membership } = await membershipOf(admin, invitee.email)
        inviteeIds.teacher = userId
        expect(membership).toMatchObject({ role: 'teacher', status: 'active' })

        const row = await pendingInvitation(admin, invitee.email)
        expect(row?.status).toBe('accepted')
      })

      await test.step('the new teacher creates a course', async () => {
        await inviteePage.goto(`${BASE}/${LOCALE}/dashboard/teacher/courses/new`, { waitUntil: 'domcontentloaded' })
        const title = inviteePage.locator('#title')
        await expect(title).toBeVisible({ timeout: 60_000 })
        await fillSettled(inviteePage, title, COURSE_TITLE)
        await domClick(inviteePage, inviteePage.locator('form button[type="submit"]'))
        await inviteePage.waitForURL(/\/dashboard\/teacher\/courses\/\d+/, { timeout: 90_000 })

        const { data: course, error } = await admin
          .from('courses')
          .select('course_id, author_id, tenant_id')
          .eq('title', COURSE_TITLE)
          .maybeSingle()
        if (error) throw new Error(`courses: ${error.message}`)
        expect(course).toMatchObject({ author_id: inviteeIds.teacher, tenant_id: CODE_ACADEMY_TENANT })
      })
    } finally {
      await context.close()
    }
  })

  test('the admin sees both new members with their roles', async ({ page }) => {
    test.setTimeout(300_000)
    expect(inviteeIds.student && inviteeIds.teacher, 'previous tests created both invitees').toBeTruthy()

    await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, BASE)
    await page.goto(`${BASE}/${LOCALE}/dashboard/admin/users`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('users-page')).toBeVisible({ timeout: 60_000 })

    const studentRow = page.getByRole('row', { name: INVITEES.student.email })
    await expect(studentRow).toBeVisible({ timeout: 30_000 })
    await expect(studentRow).toContainText(/student/i)

    const teacherRow = page.getByRole('row', { name: INVITEES.teacher.email })
    await expect(teacherRow).toBeVisible()
    await expect(teacherRow).toContainText(/teacher/i)
  })
})
