/**
 * Staff view of exercise challenges: the "Challenge attempts" section on the
 * exercise attempts page and the "Retos" overview/detail pages.
 *
 * Own throwaway school (via the challenge fixtures), nothing seeded is touched.
 * Plays are seeded with the service-role client (as /api/reto/attempt would
 * store them); grading is not exercised here (see exercise-challenges.spec.ts).
 */
import { test, expect } from './utils/test'
import { login } from './utils/auth'
import { LOCALE } from './utils/constants'
import { SEEDED, getAdmin, tenantBase, type QaTenant } from './utils/plan-gate-fixtures'
import { createChallengeWorld, destroyChallengeFixtures, mintGuest, seedGuestAttempt, type ChallengeWorld } from './utils/challenge-fixtures'

const RUN = Date.now()
const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000001049',
  slug: 'qa-challenges-staff',
  name: 'QA Challenges Staff',
  planSlug: 'e2e-challenges-staff-no-plan',
}
const BASE_URL = tenantBase(QA.slug)
const admin = getAdmin()
let world: ChallengeWorld

test.describe.configure({ mode: 'serial' })

test.describe('challenges staff view', () => {
  test.beforeAll(async () => {
    world = await createChallengeWorld(admin, QA, RUN)
    // A guest play with a stored answer + AI feedback on the played exercise.
    await seedGuestAttempt(admin, QA.id, world.playEx, mintGuest().hash, 55, {
      passed: false,
      answer: { text: 'my guest answer' },
      feedback: { feedback: 'needs more detail' },
    })
  })

  test.afterAll(async () => {
    await destroyChallengeFixtures(admin, QA, world ? [world.users.a.id, world.users.b.id] : [])
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test('attempts page lists challenge plays with answer and feedback, guests as Invitado', async ({ page }) => {
    await login(page, SEEDED.owner.email, SEEDED.owner.password, BASE_URL)
    await page.goto(`${BASE_URL}/${LOCALE}/dashboard/teacher/courses/${world.freeCourseId}/exercises/${world.playEx}/attempts`)
    const section = page.getByTestId('challenge-attempts-section')
    await expect(section).toBeVisible()
    await expect(section.getByTestId('challenge-attempt')).toHaveCount(3)
    await expect(section).toContainText('Ana Maria Lopez')
    await expect(section).toContainText('Invitado')
    await expect(section).toContainText('my guest answer')
    await expect(section).toContainText('needs more detail')
    // Hashes never reach the page.
    expect(await page.content()).not.toContain('e2e-ip')
  })

  test('overview shows aggregates; detail shows links, leaderboard and plays', async ({ page }) => {
    await login(page, SEEDED.owner.email, SEEDED.owner.password, BASE_URL)
    await page.goto(`${BASE_URL}/${LOCALE}/dashboard/teacher/challenges`)
    const row = page.getByTestId('challenge-row').filter({ hasText: `Play target ${RUN}` })
    await expect(row).toBeVisible()
    await expect(row).toContainText('2 activos')
    await row.getByRole('link', { name: `Play target ${RUN}` }).click()
    await expect(page.getByTestId('challenge-leaderboard').locator('li').first()).toContainText('Ana Maria Lopez')
    await expect(page.getByTestId('challenge-attempt')).toHaveCount(3)
  })

  test('a teacher who authored nothing sees the empty state and gets 404 on detail', async ({ page }) => {
    await admin.from('tenant_users').update({ role: 'teacher' }).eq('tenant_id', QA.id).eq('user_id', SEEDED.student.id)
    await login(page, SEEDED.student.email, SEEDED.student.password, BASE_URL)
    await page.goto(`${BASE_URL}/${LOCALE}/dashboard/teacher/challenges`)
    await expect(page.getByTestId('challenges-empty')).toBeVisible()
    const res = await page.goto(`${BASE_URL}/${LOCALE}/dashboard/teacher/challenges/${world.playEx}`)
    expect(res?.status()).toBe(404)
  })
})
