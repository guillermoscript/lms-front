/**
 * Exercise challenges, end to end (epic #1025, issue #1033).
 *
 * A guest opens /reto/<token>, plays an AI-graded essay exercise, compares the
 * score with the challenger, signs in and claims the result; a FREE course
 * grants an entitlement on claim, a PAID one never does.
 *
 * WHAT IS MOCKED (and why)
 *  - AI grading. The local stack has no BYOK key, so `POST /api/reto/attempt` is
 *    fulfilled by the test ONLY in "guest plays" (UI flow: result card, duel,
 *    ranking). The grading logic itself has unit coverage
 *    (tests/unit/challenge-grade.test.ts, challenge-attempt.test.ts).
 *  - Google sign-in. OAuth cannot run on lvh.me, so the claim is driven with the
 *    local test account (student@e2etest.com, password login) opening
 *    /reto/<token>?claim=1 — the URL the Google callback lands on. Everything
 *    behind it is REAL: the signed `reto_guest` httpOnly cookie, the keyed hash
 *    in `challenge_attempts`, the `claimChallenge` server action,
 *    `grant_free_entitlement`. The guest attempt row is seeded (as the attempt
 *    API would have stored it) because grading cannot run to create it.
 *  - NOT mocked: the caps/paused specs hit the real attempt API (limits run
 *    before any AI call), and every 404 assertion is a real HTTP status.
 *  - NOT covered: creating a link from a student's attempt. `createChallengeLink`
 *    has no caller in the UI yet, so a spec can only seed the row (see the
 *    "challenge links" block); creation is covered by tests/unit/challenge-links-actions.test.ts.
 *
 * Needs CHALLENGE_HASH_SECRET in the spec's env AND the app server's (same value).
 * Fixtures: one throwaway school, own users, removed in afterAll. The seeded
 * schools and the evidence rows (exercises 3001-3003, demo-token-*) are untouched.
 */
import { test, expect } from './utils/test'
import { login } from './utils/auth'
import { LOCALE } from './utils/constants'
import { SEEDED, getAdmin, tenantBase, type QaTenant } from './utils/plan-gate-fixtures'
import {
  GUEST_COOKIE,
  cookieFor,
  createChallengeWorld,
  destroyChallengeFixtures,
  mintGuest,
  seedGuestAttempt,
  type ChallengeWorld,
} from './utils/challenge-fixtures'

const RUN = Date.now()
const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000001033',
  slug: 'qa-challenges',
  name: 'QA Challenges',
  planSlug: 'e2e-challenges-no-plan',
}
const HOST = `${QA.slug}.lvh.me`
const QA_BASE = tenantBase(QA.slug)
const DEFAULT_BASE = tenantBase('default')

const admin = getAdmin()
let world: ChallengeWorld

const page_ = (token: string, locale = LOCALE) => `${QA_BASE}/${locale}/reto/${token}`

test.describe.configure({ mode: 'serial' })

test.describe('exercise challenges (#1025)', () => {
  test.beforeAll(async () => {
    world = await createChallengeWorld(admin, QA, RUN)
  })

  test.afterAll(async () => {
    await destroyChallengeFixtures(admin, QA, world ? [world.users.a.id, world.users.b.id] : [])
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test.describe('public page', () => {
    test('an open link (no score) shows the exercise, not a challenger', async ({ page }) => {
      const res = await page.goto(page_(world.links.open))
      expect(res?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(`Play target ${RUN}`)
      await expect(page.getByTestId('challenger-card')).toHaveCount(0)
      await expect(page.getByTestId('challenge-submit')).toBeVisible()
    })

    test('a link with a score shows the challenger as first name + initial, never an email', async ({ page }) => {
      const res = await page.goto(page_(world.links.scored))
      expect(res?.status()).toBe(200)
      const card = page.getByTestId('challenger-card')
      await expect(card).toContainText(world.users.a.label)
      await expect(card).toContainText(String(world.users.a.score))
      const html = await page.content()
      expect(html).not.toContain(world.users.a.email)
      expect(html).not.toContain('Maria')
      expect(html).not.toContain('Lopez')
    })
  })

  test.describe('guest plays (grading mocked)', () => {
    test('submit → result, duel against the challenger, ranking without emails', async ({ page }) => {
      // MOCK: AI grading. Only the attempt endpoint; the page, ranking and duel are real.
      await page.route('**/api/reto/attempt', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            attemptId: 'mock', score: 81, passed: true, passingScore: 70,
            feedback: 'Mocked grader feedback', strengths: ['Clear structure'], improvements: ['Add an example'],
            isOfficial: true, alreadyGraded: false,
          }),
        }),
      )
      await page.goto(page_(world.links.scored))
      await page.getByLabel(/your answer/i).fill('A unit test checks one small piece of code in isolation.')
      await page.getByTestId('challenge-submit').click()

      const result = page.getByTestId('challenge-result')
      await expect(result.getByTestId('challenge-score')).toHaveText('81')
      await expect(result).toContainText('Mocked grader feedback')

      // Ranking: real rows (A 87, B 64), labelled first name + last initial.
      const ranking = page.getByRole('region', { name: /ranking/i })
      await expect(ranking).toContainText(world.users.a.label)
      await expect(ranking).toContainText(world.users.b.label)
      const html = await page.content()
      for (const u of [world.users.a, world.users.b]) {
        expect(html).not.toContain(u.email)
        expect(html).not.toContain(u.fullName)
      }
      // 87 ranks above 64.
      const rows = ranking.locator('tbody tr')
      await expect(rows.first()).toContainText(world.users.a.label)
    })
  })

  test.describe('claim after sign-in', () => {
    // Google OAuth cannot run locally: the test account signs in with a password and
    // lands on the same URL the OAuth callback uses (?claim=1). See the header.

    test('FREE course: claim saves the score, grants an entitlement, unlocks the next exercise', async ({ page, context }) => {
      const guest = mintGuest()
      await seedGuestAttempt(admin, QA.id, world.freeEx, guest.hash, 74)

      await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
      await context.addCookies([cookieFor(HOST, guest.token)])

      const { count: before } = await admin
        .from('entitlements')
        .select('entitlement_id', { count: 'exact', head: true })
        .eq('user_id', SEEDED.student.id)
        .eq('course_id', world.freeCourseId)
      expect(before).toBe(0)

      await page.goto(`${page_(world.links.claimFree)}?claim=1`)
      await expect(page.getByText('Result saved')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('Your score: 74')).toBeVisible()
      await expect(page.getByText('Your free access is ready.')).toBeVisible()

      const { data: ent } = await admin
        .from('entitlements')
        .select('status, source_type')
        .eq('user_id', SEEDED.student.id)
        .eq('course_id', world.freeCourseId)
      expect(ent).toEqual([{ status: 'active', source_type: 'free' }])

      const { data: attempt } = await admin
        .from('challenge_attempts')
        .select('user_id, is_official')
        .eq('guest_token_hash', guest.hash)
        .single()
      expect(attempt).toEqual({ user_id: SEEDED.student.id, is_official: true })

      // The next exercise opens now that access exists.
      const next = page.getByRole('link', { name: 'Next exercise' })
      await expect(next).toHaveAttribute(
        'href',
        `/dashboard/student/courses/${world.freeCourseId}/exercises/${world.freeNextEx}`,
      )
      // A full load, not a click: the dev server's client-side RSC navigation to an
      // exercise page throws a Flight decode error that is unrelated to this feature.
      await page.goto(`${QA_BASE}/${LOCALE}${await next.getAttribute('href')}`)
      await expect(page.getByText(`Next exercise ${RUN}`).first()).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('Something went wrong!')).toHaveCount(0)
    })

    test('PAID course: claim saves the score and grants NO entitlement', async ({ page, context }) => {
      const guest = mintGuest()
      await seedGuestAttempt(admin, QA.id, world.paidEx, guest.hash, 66)

      await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
      await context.addCookies([cookieFor(HOST, guest.token)])
      await page.goto(`${page_(world.links.paid)}?claim=1`)

      await expect(page.getByText('This course is paid')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText(/score of 66 is saved/)).toBeVisible()
      await expect(page.getByRole('link', { name: 'Get the course' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Next exercise' })).toHaveCount(0)

      // The attempt is claimed (it counts in the ranking) ...
      const { data: attempt } = await admin
        .from('challenge_attempts')
        .select('user_id')
        .eq('guest_token_hash', guest.hash)
        .single()
      expect(attempt?.user_id).toBe(SEEDED.student.id)

      // ... and nothing was granted, to anyone, for the paid course.
      const { data: ents, error } = await admin
        .from('entitlements')
        .select('entitlement_id')
        .eq('course_id', world.paidCourseId)
      expect(error).toBeNull()
      expect(ents).toEqual([])
    })

    test('a signed guest cookie that matches no attempt claims nothing', async ({ page, context }) => {
      await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
      await context.addCookies([cookieFor(HOST, mintGuest().token)])
      await page.goto(`${page_(world.links.open)}?claim=1`)
      await expect(page.getByText("We couldn't find a result to save on this device.")).toBeVisible({ timeout: 30_000 })
    })
  })

  test.describe('caps (real attempt API: limits run before any AI call)', () => {
    test('hourly cap per device: the 6th try is refused with "too many attempts"', async ({ page, context }) => {
      const guest = mintGuest()
      for (let i = 0; i < 5; i++) {
        await seedGuestAttempt(admin, QA.id, world.capEx, guest.hash, 50, { is_official: i === 0, passed: false })
      }
      await context.addCookies([cookieFor(HOST, guest.token)])
      await page.goto(page_(world.links.capLink))
      await page.getByLabel(/your answer/i).fill(`A brand new answer ${RUN}`)
      await page.getByTestId('challenge-submit').click()
      await expect(page.getByText('Too many attempts. Try again later.')).toBeVisible({ timeout: 30_000 })
    })

    test('monthly guest cap reached: the challenge shows as paused ("reto pausado")', async ({ page, context }) => {
      // Cap of 1, and one guest attempt already this month => a fresh guest is paused.
      const { error } = await admin
        .from('tenant_settings')
        .upsert({ tenant_id: QA.id, setting_key: 'challenges_guest_monthly_cap', setting_value: 1 }, { onConflict: 'tenant_id,setting_key' })
      expect(error).toBeNull()
      try {
        await context.addCookies([cookieFor(HOST, mintGuest().token)])
        await page.goto(page_(world.links.capLink, 'es'))
        await page.getByLabel(/tu respuesta/i).fill(`Otra respuesta nueva ${RUN}`)
        await page.getByTestId('challenge-submit').click()
        await expect(page.getByText('Este reto está en pausa por ahora.')).toBeVisible({ timeout: 30_000 })
      } finally {
        await admin.from('tenant_settings').delete().eq('tenant_id', QA.id).eq('setting_key', 'challenges_guest_monthly_cap')
      }
    })
  })

  test.describe('real HTTP 404s', () => {
    test('unknown token → 404 (page and API)', async ({ request }) => {
      const res = await request.get(page_(`e2e-unknown-${RUN}`), { maxRedirects: 0 })
      expect(res.status()).toBe(404)
      const api = await request.post(`${QA_BASE}/api/reto/attempt`, { data: { token: `e2e-unknown-${RUN}`, answer: 'x' } })
      expect(api.status()).toBe(404)
    })

    test('a link opened on ANOTHER school\'s host → 404 (tenant isolation)', async ({ request }) => {
      const res = await request.get(`${DEFAULT_BASE}/${LOCALE}/reto/${world.links.scored}`, { maxRedirects: 0 })
      expect(res.status()).toBe(404)
      const api = await request.post(`${DEFAULT_BASE}/api/reto/attempt`, { data: { token: world.links.scored, answer: 'x' } })
      expect(api.status()).toBe(404)
    })

    test('challenges switched OFF for the school → 404, and back on → 200', async ({ request }) => {
      const set = (value: unknown) =>
        admin.from('tenant_settings').upsert(
          { tenant_id: QA.id, setting_key: 'challenges_enabled', setting_value: value },
          { onConflict: 'tenant_id,setting_key' },
        )
      expect((await set({ enabled: false })).error).toBeNull()
      try {
        const off = await request.get(page_(world.links.scored), { maxRedirects: 0 })
        expect(off.status()).toBe(404)
        const api = await request.post(`${QA_BASE}/api/reto/attempt`, { data: { token: world.links.scored, answer: 'x' } })
        expect(api.status()).toBe(404)
      } finally {
        expect((await set({ enabled: true })).error).toBeNull()
      }
      const on = await request.get(page_(world.links.scored), { maxRedirects: 0 })
      expect(on.status()).toBe(200)
    })
  })

  test.describe('link management (student)', () => {
    // The link row is seeded: nothing in the UI calls `createChallengeLink` yet.
    test('the student lists their link and deactivates it → real 404', async ({ page, request }) => {
      await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
      await page.goto(`${QA_BASE}/${LOCALE}/dashboard/student/challenges`)
      const list = page.getByTestId('challenge-links-list')
      await expect(list).toContainText(`/reto/${world.links.studentOwned}`, { timeout: 30_000 })
      await expect(list).toContainText('Score 77')

      expect((await request.get(page_(world.links.studentOwned), { maxRedirects: 0 })).status()).toBe(200)

      // base-ui Buttons swallow some Playwright clicks: click in the page.
      await page.getByRole('button', { name: 'Deactivate' }).first().evaluate((el) => (el as HTMLButtonElement).click())
      await expect(page.getByText('Link deactivated')).toBeVisible()

      const { data: link } = await admin.from('challenge_links').select('active').eq('token', world.links.studentOwned).single()
      expect(link?.active).toBe(false)
      expect((await request.get(page_(world.links.studentOwned), { maxRedirects: 0 })).status()).toBe(404)
      const api = await request.post(`${QA_BASE}/api/reto/attempt`, { data: { token: world.links.studentOwned, answer: 'x' } })
      expect(api.status()).toBe(404)
    })
  })

  test.describe('admin settings', () => {
    test('the cap field shows the default; saving persists the toggle and the cap', async ({ page }) => {
      test.setTimeout(90_000)
      await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
      await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/settings?tab=enrollment`)
      const form = page.getByTestId('challenge-settings-form')
      await expect(form).toBeVisible({ timeout: 30_000 })
      const cap = form.getByLabel('Monthly guest attempt cap')
      await expect(cap).toHaveAttribute('placeholder', '200')
      await expect(form).toContainText('default (200)')

      try {
        await cap.fill('5')
        // base-ui Switch/Button: click inside the page.
        await form.getByRole('switch').evaluate((el) => (el as HTMLElement).click())
        await form.getByRole('button', { name: 'Save' }).evaluate((el) => (el as HTMLButtonElement).click())
        await expect(page.getByText('Challenge settings saved')).toBeVisible({ timeout: 15_000 })

        const { data: rows } = await admin
          .from('tenant_settings')
          .select('setting_key, setting_value')
          .eq('tenant_id', QA.id)
          .in('setting_key', ['challenges_enabled', 'challenges_guest_monthly_cap'])
        const byKey = Object.fromEntries((rows ?? []).map((r) => [r.setting_key, r.setting_value]))
        expect(byKey.challenges_enabled).toEqual({ enabled: false })
        expect(JSON.stringify(byKey.challenges_guest_monthly_cap)).toContain('5')
      } finally {
        await admin.from('tenant_settings').delete().eq('tenant_id', QA.id).eq('setting_key', 'challenges_guest_monthly_cap')
        await admin
          .from('tenant_settings')
          .upsert({ tenant_id: QA.id, setting_key: 'challenges_enabled', setting_value: { enabled: true } }, { onConflict: 'tenant_id,setting_key' })
      }
    })
  })
})

// Referenced so a typo in the cookie name fails loudly at import time.
void GUEST_COOKIE
