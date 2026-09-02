/**
 * Every surface a plan LIMIT is supposed to stop, on a tenant at its caps
 * (#296 Phase 5, cases 1–2; complements plan-limit-enforcement.spec.ts which
 * pins the trigger itself on the Default School).
 *
 *   courses at cap  → teacher course form refuses, AI course wizard is disabled
 *   students at cap → a direct seat insert dies with LM001, /join-school
 *                     refuses with the student-limit copy, and a pending
 *                     invitation does not buy a seat either
 *
 * The tenant sits on a hidden plan with `max_courses: 1` / `max_students: 1`
 * (see utils/plan-gate-fixtures.ts), so "at the cap" is one course and one
 * student — the same code paths a Free school at 5/50 goes through.
 */
import { test, expect } from '@playwright/test'
import { login } from './utils/auth'
import { LOCALE } from './utils/constants'
import {
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  insertCourse,
  loginExpectingJoinSchool,
  setTenantPlan,
  tenantBase,
  upsertTinyPlan,
  usageOf,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000296',
  slug: 'qa-plan-limits',
  name: 'QA Plan Limits',
  planSlug: 'e2e-tiny-limits',
}
const QA_BASE = tenantBase(QA.slug)

test.describe.configure({ mode: 'serial' })

test.describe('plan limits — every surface at the cap (#296)', () => {
  test.beforeAll(async () => {
    const admin = getAdmin()
    await destroyQaTenant(admin, QA)
    await upsertTinyPlan(admin, QA.planSlug, { max_courses: 1, max_students: 1 })

    // Built on Free (limits 5/50) so the fixtures themselves never trip the
    // triggers, then moved to the tiny plan — exactly the state a school is in
    // the day after a downgrade.
    await createQaTenant(admin, QA, 'free')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')
    await insertCourse(admin, QA.id, 'E2E #296 the only course')
    await setTenantPlan(admin, QA.id, QA.planSlug)
  })

  test.afterAll(async () => {
    await destroyQaTenant(getAdmin(), QA)
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test('the usage RPC reports the tenant at both caps', async () => {
    expect(await usageOf(getAdmin(), QA.id)).toEqual({
      courses: 1,
      students: 1,
      max_courses: 1,
      max_students: 1,
    })
  })

  test('the course form refuses before it renders a field', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/teacher/courses/new`)

    await expect(page.getByText('Course Limit Reached')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/limited to 1 courses/)).toBeVisible()
    await expect(page.getByLabel(/title/i)).toHaveCount(0)
  })

  test('the AI course wizard is disabled at the cap', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/courses/new`)

    await expect(page.getByText('Course limit reached')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Generate draft' })).toBeDisabled()
  })

  test('a second student seat is refused by the database', async () => {
    const admin = getAdmin()
    const { error } = await admin
      .from('tenant_users')
      .insert({ tenant_id: QA.id, user_id: SEEDED.alice.id, role: 'student', status: 'active' })

    expect(error?.code).toBe('LM001')
    expect(error?.message).toContain('plan_limit_exceeded:students')
    expect((await usageOf(admin, QA.id)).students).toBe(1)
  })

  test('joining the school is refused at the cap, invitation or not', async ({ page }) => {
    test.setTimeout(120_000)
    const admin = getAdmin()

    // An invitation is the one path that could be argued to "reserve" a seat.
    // It does not: the seat count is what the plan sells.
    const { error: inviteError } = await admin.from('tenant_invitations').insert({
      tenant_id: QA.id,
      email: SEEDED.alice.email,
      role: 'student',
      invited_by: SEEDED.owner.id,
      status: 'pending',
    })
    expect(inviteError).toBeNull()

    await loginExpectingJoinSchool(page, QA_BASE, SEEDED.alice.email, SEEDED.alice.password)
    const joinButton = page.getByRole('button', { name: `Join ${QA.name}` })
    await expect(joinButton).toBeVisible({ timeout: 20_000 })
    // base-ui Button: a real DOM click, not Playwright's synthesized one.
    await joinButton.evaluate((el) => (el as HTMLElement).click())

    await expect(page.getByText('This school has reached its student limit')).toBeVisible({ timeout: 20_000 })

    const { data: membership } = await admin
      .from('tenant_users')
      .select('status')
      .eq('tenant_id', QA.id)
      .eq('user_id', SEEDED.alice.id)
      .maybeSingle()
    expect(membership).toBeNull()

    const { data: invitation } = await admin
      .from('tenant_invitations')
      .select('status')
      .eq('tenant_id', QA.id)
      .eq('email', SEEDED.alice.email)
      .single()
    expect(invitation?.status).toBe('pending')
  })
})
