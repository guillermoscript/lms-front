/**
 * The over-limit access cutoff, end to end over HTTP (#296 Phase 5, case 3).
 *
 * A tenant with two live courses on a plan that allows one:
 *   1. the nightly sweep schedules `access_cutoff_at` 14 days out and attempts
 *      the first reminder rung (delivered → ledger row; undeliverable → counted
 *      in `notifyFailures` and retried tomorrow)
 *   2. once the cutoff is in the past, a student with a live entitlement lands
 *      on the suspended page instead of the course
 *   3. archiving the extra course and re-running the sweep clears the cutoff
 *      and the same URL opens again
 *
 * The unit tests in tests/unit/access-cutoff*.test.ts own the decision table
 * and the ladder timing with a fake mailer; this spec proves the route, the
 * RPC the content pages call and the page itself agree with them.
 */
import { test, expect } from '@playwright/test'
import { login } from './utils/auth'
import { LOCALE } from './utils/constants'
import {
  DAY_MS,
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  insertCourse,
  runEnforceSweep,
  setTenantPlan,
  tenantBase,
  tenantRow,
  upsertTinyPlan,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000297',
  slug: 'qa-cutoff-lifecycle',
  name: 'QA Cutoff Lifecycle',
  planSlug: 'e2e-tiny-cutoff',
}
const QA_BASE = tenantBase(QA.slug)

let keptCourseId: number
let extraCourseId: number

test.describe.configure({ mode: 'serial' })

test.describe('access cutoff lifecycle (#296)', () => {
  test.skip(!process.env.CRON_SECRET, 'CRON_SECRET is required to call the sweep')

  test.beforeAll(async () => {
    const admin = getAdmin()
    await destroyQaTenant(admin, QA)
    await upsertTinyPlan(admin, QA.planSlug, { max_courses: 1, max_students: -1 })

    await createQaTenant(admin, QA, 'free')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')
    keptCourseId = await insertCourse(admin, QA.id, 'E2E #296 kept course')
    extraCourseId = await insertCourse(admin, QA.id, 'E2E #296 extra course')

    // The student owns the kept course outright, so the only thing that can
    // refuse them is the tenant-wide cutoff.
    const { error } = await admin.from('entitlements').insert({
      user_id: SEEDED.student.id,
      course_id: keptCourseId,
      tenant_id: QA.id,
      source_type: 'admin_grant',
      status: 'active',
    })
    if (error) throw new Error(`could not grant entitlement: ${error.message}`)

    // 2 live courses on a 1-course plan: over the limit from this point on.
    await setTenantPlan(admin, QA.id, QA.planSlug)
  })

  test.afterAll(async () => {
    await destroyQaTenant(getAdmin(), QA)
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test('the sweep schedules the cutoff and attempts the first reminder', async ({ request }) => {
    const admin = getAdmin()
    expect((await tenantRow(admin, QA.id)).access_cutoff_at).toBeNull()

    const first = await runEnforceSweep(request)
    expect(first.success).toBe(true)
    expect(first.scheduled).toBeGreaterThanOrEqual(1)

    const scheduled = (await tenantRow(admin, QA.id)).access_cutoff_at
    expect(scheduled).not.toBeNull()
    const daysOut = (new Date(scheduled!).getTime() - Date.now()) / DAY_MS
    expect(daysOut).toBeGreaterThan(13.9)
    expect(daysOut).toBeLessThan(14.1)

    // The `scheduled` rung is due the moment the cutoff exists. With a mailer
    // configured it is delivered and written to the ledger; without one every
    // send returns false, nothing is written, and the sweep reports the miss
    // so tomorrow's run retries. Either way the rung was attempted.
    const { data: ledger } = await admin
      .from('access_cutoff_notifications')
      .select('stage, recipient_count')
      .eq('tenant_id', QA.id)
    if (process.env.MAILGUN_API_KEY) {
      expect(ledger).toEqual([expect.objectContaining({ stage: 'scheduled' })])
      expect(first.notified.scheduled ?? 0).toBeGreaterThanOrEqual(1)
    } else {
      expect(ledger).toEqual([])
      expect(first.notifyFailures).toBeGreaterThanOrEqual(1)
    }

    // Idempotent: a second sweep neither reschedules nor moves the date.
    const second = await runEnforceSweep(request)
    expect(second.success).toBe(true)
    expect((await tenantRow(admin, QA.id)).access_cutoff_at).toBe(scheduled)
  })

  test('a student is sent to the suspended page once the cutoff is live', async ({ page }) => {
    test.setTimeout(120_000)
    const admin = getAdmin()
    const { error } = await admin
      .from('tenants')
      .update({ access_cutoff_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
      .eq('id', QA.id)
    expect(error).toBeNull()

    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/student/courses/${keptCourseId}`)

    await expect(page).toHaveURL(/\/dashboard\/student\/access-suspended/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: "Your school's access is suspended" })).toBeVisible()
  })

  test('archiving the extra course clears the cutoff and reopens the course', async ({ page, request }) => {
    test.setTimeout(120_000)
    const admin = getAdmin()
    const { error } = await admin.from('courses').update({ status: 'archived' }).eq('course_id', extraCourseId)
    expect(error).toBeNull()

    const sweep = await runEnforceSweep(request)
    expect(sweep.success).toBe(true)
    expect(sweep.cleared).toBeGreaterThanOrEqual(1)
    expect((await tenantRow(admin, QA.id)).access_cutoff_at).toBeNull()

    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/student/courses/${keptCourseId}`)
    await expect(page).toHaveURL(new RegExp(`/dashboard/student/courses/${keptCourseId}`), { timeout: 20_000 })
    await expect(page).not.toHaveURL(/access-suspended/)
  })
})
