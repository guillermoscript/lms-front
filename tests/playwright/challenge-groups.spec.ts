/**
 * Challenge groups, Phase 1 (epic #1049, issue #1050).
 *
 * A student creates a group and launches an essay challenge into it; a guest
 * plays through the group link; an account holder who is not a school member is
 * sent through /join-school; a member claims a guest score and lands in the group;
 * the leaderboard shows the right order with the guest as "Guest".
 *
 * WHAT IS MOCKED (same reasons as exercise-challenges.spec.ts)
 *  - AI grading: guest/member attempts are SEEDED rows, as /api/reto/attempt would
 *    store them (the local stack has no BYOK key). Grading has unit coverage.
 *  - Google sign-in: password login on lvh.me; the claim is driven at
 *    /reto/<token>?claim=1, the URL the OAuth callback lands on.
 *  - REAL: group creation, launch (shared createLinkCore), invite page, join,
 *    claim -> group membership, leaderboard maths and rendering.
 *
 * Needs CHALLENGE_HASH_SECRET shared with the app server. App on port 3005,
 * `--workers=1`. One throwaway school, removed in afterAll.
 */
import { test, expect } from './utils/test'
import { login, loginAsNonMember } from './utils/auth'
import { LOCALE } from './utils/constants'
import { SEEDED, addMember, getAdmin, tenantBase, type QaTenant } from './utils/plan-gate-fixtures'
import {
  cookieFor,
  createChallengeWorld,
  destroyChallengeFixtures,
  mintGuest,
  seedGuestAttempt,
  type ChallengeWorld,
} from './utils/challenge-fixtures'

const RUN = Date.now()
const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000001050',
  slug: 'qa-groups',
  name: 'QA Groups',
  planSlug: 'e2e-groups-no-plan',
}
const HOST = `${QA.slug}.lvh.me`
const BASE = tenantBase(QA.slug)

const admin = getAdmin()
let world: ChallengeWorld
let groupId = ''
let inviteToken = ''
let linkToken = ''
const extraUsers: string[] = []

async function createUser(email: string, fullName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'password123', email_confirm: true, user_metadata: { full_name: fullName } })
  if (error || !data.user) throw new Error(`could not create ${email}: ${error?.message}`)
  await admin.from('profiles').update({ full_name: fullName }).eq('id', data.user.id)
  extraUsers.push(data.user.id)
  return data.user.id
}

test.describe.configure({ mode: 'serial' })

test.describe('challenge groups (#1050)', () => {
  test.beforeAll(async () => {
    world = await createChallengeWorld(admin, QA, RUN)
    // The student needs the course to pick its exercises.
    await admin.from('entitlements').insert({
      tenant_id: QA.id, user_id: SEEDED.student.id, course_id: world.freeCourseId, source_type: 'free', status: 'active',
    })
  })

  test.afterAll(async () => {
    await admin.from('challenge_group_challenges').delete().eq('tenant_id', QA.id)
    await admin.from('challenge_group_members').delete().eq('tenant_id', QA.id)
    await admin.from('challenge_groups').delete().eq('tenant_id', QA.id)
    await destroyChallengeFixtures(admin, QA, [world.users.a.id, world.users.b.id, ...extraUsers])
  })

  test('student creates a group and launches an essay challenge', async ({ page }) => {
    await login(page, SEEDED.student.email, SEEDED.student.password, BASE)
    await page.goto(`${BASE}/${LOCALE}/dashboard/student/groups`)
    await page.getByLabel('Group name').fill(`Friends ${RUN}`)
    await page.getByTestId('create-group-submit').evaluate((el) => (el as HTMLElement).click())
    await page.waitForURL(/\/dashboard\/student\/groups\/[0-9a-f-]{36}/)
    groupId = page.url().match(/groups\/([0-9a-f-]{36})/)![1]
    await expect(page.getByRole('heading', { name: `Friends ${RUN}` })).toBeVisible()

    await page.locator('#launch-exercise').selectOption(String(world.playEx))
    await page.getByTestId('launch-submit').evaluate((el) => (el as HTMLElement).click())
    await expect(page.getByTestId('group-challenge')).toHaveCount(1, { timeout: 20_000 })

    const { data: g } = await admin.from('challenge_groups').select('invite_token').eq('id', groupId).single()
    inviteToken = g!.invite_token
    const { data: gc } = await admin.from('challenge_group_challenges').select('link_id').eq('group_id', groupId).single()
    const { data: l } = await admin.from('challenge_links').select('token').eq('id', gc!.link_id).single()
    linkToken = l!.token
  })

  test('guest sees the group, its members and the challenge to play', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto(`${BASE}/${LOCALE}/grupo/${inviteToken}`)
    await expect(page.getByTestId('group-invite-title')).toContainText(`Friends ${RUN}`)
    await expect(page.getByTestId('group-invite-members')).toBeVisible()
    await expect(page.getByTestId('group-invite-play')).toHaveAttribute('href', new RegExp(`/reto/${linkToken}`))
    expect((await page.request.get(`${BASE}/${LOCALE}/grupo/not-a-real-token-xyz`)).status()).toBe(404)
  })

  test('account holder who is not a school member goes through join-school', async ({ page }) => {
    const email = `e2e-grp-outsider-${RUN}@e2etest.invalid`
    await createUser(email, 'Olga Outsider')
    await loginAsNonMember(page, email, 'password123', BASE)
    await page.goto(`${BASE}/${LOCALE}/grupo/${inviteToken}`)
    await expect(page).toHaveURL(/join-school/)
  })

  test('leaderboard: member + unclaimed guest, then a claim merges into the group', async ({ page, context }) => {
    // Student (member): 90. Guest on the group link: 70. Student wins the challenge.
    const { data: link } = await admin.from('challenge_links').select('id').eq('token', linkToken).single()
    await admin.from('challenge_attempts').insert({
      tenant_id: QA.id, exercise_id: world.playEx, user_id: SEEDED.student.id, score: 90, passed: true,
      is_official: true, ip_hash: 'e2e-ip', answer: { text: 'x' }, link_id: link!.id,
    })
    const guest = mintGuest()
    await seedGuestAttempt(admin, QA.id, world.playEx, guest.hash, 70, { link_id: link!.id })

    await login(page, SEEDED.student.email, SEEDED.student.password, BASE)
    await page.goto(`${BASE}/${LOCALE}/dashboard/student/groups/${groupId}`)
    const rows = page.getByTestId('group-leaderboard-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('90')
    await expect(rows.nth(0).getByTestId('group-won')).toHaveText('1')
    await expect(rows.nth(1)).toContainText('Guest')
    await expect(rows.nth(1)).toContainText('70')
    // Never another person's answer.
    await expect(page.getByText('seeded answer')).toHaveCount(0)

    // A second school member claims their own guest score through the group link.
    const email = `e2e-grp-member-${RUN}@e2etest.invalid`
    const memberId = await createUser(email, 'Maria Member')
    await addMember(admin, QA.id, memberId, 'student')
    const guest2 = mintGuest()
    await seedGuestAttempt(admin, QA.id, world.playEx, guest2.hash, 55, { link_id: link!.id })
    await context.clearCookies()
    await login(page, email, 'password123', BASE)
    await context.addCookies([cookieFor(HOST, guest2.token)])
    await page.goto(`${BASE}/${LOCALE}/reto/${linkToken}?claim=1`)
    await expect(page.getByText('Result saved')).toBeVisible({ timeout: 30_000 })

    const { data: m } = await admin.from('challenge_group_members').select('role').eq('group_id', groupId).eq('user_id', memberId)
    expect(m).toEqual([{ role: 'member' }])
  })
})
