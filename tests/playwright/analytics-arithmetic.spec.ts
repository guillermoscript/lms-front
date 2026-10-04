/**
 * The analytics and revenue screens report the RIGHT numbers (#716 §2).
 *
 * `admin-management.spec.ts` asserts the analytics page loads and
 * `admin-pages.spec.ts` that the stats grid renders. Neither reads a figure,
 * and every figure on those screens is arithmetic over `transactions`,
 * `entitlements` and `lesson_completions` — the kind of thing that fails
 * silently, because a rejected query and a school that has sold nothing both
 * render `0`. That is exactly how the `created_at` bug (#547 §2) survived, and
 * writing this spec found two more of the same shape on the analytics page: a
 * `tenant_id` filter on `lesson_completions`, a table which has no such column,
 * so active students and lesson completions were 0 for every school forever;
 * and an enrollment query that never selected `user_id` while filtering on it,
 * so the average completion rate was 0% for every school forever.
 *
 * The ledger below is chosen so that a wrong answer cannot look right:
 *
 *   | sale | provider | amount | refunded | status     | kept | platform fee |
 *   |------|----------|--------|----------|------------|------|--------------|
 *   | A/1  | stripe   | 100.00 |        — | successful |  100 |        20.00 |
 *   | A/2  | manual   |  60.00 |        — | successful |   60 |         0.00 |
 *   | B/1  | stripe   | 200.00 |    50.00 | successful |  150 |        30.00 |
 *   | B/2  | stripe   |  80.00 |    80.00 | refunded   |    — |            — |
 *
 * gross 310.00 · fees 50.00 · net 260.00 · 3 counted sales · A 160.00, B 150.00
 *
 * Every trap #547 documented is in there: a PARTIAL refund that stays
 * `successful` and must be counted net (a sum over `amount` alone reports
 * 360.00), a FULL refund that must drop out entirely, and a `manual` sale which
 * bears NO platform fee (`bearsPlatformFee`, never `revenue_splits`) — a flat
 * 20% over the gross reports 62.00 in fees instead of 50.00.
 *
 * The split is snapshotted per transaction by the #512 backstop trigger, so the
 * `revenue_splits` row is written BEFORE the ledger; the numbers here are the
 * ones that trigger stamps, not a rate applied afterwards.
 *
 * Fixtures live on their own tenant (same reasoning as the plan-gate specs):
 * the seeded schools carry sales other specs count, and a ledger that has to be
 * exact cannot share a tenant with them.
 */
import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { login } from './utils/auth'
import { LOCALE } from './utils/constants'
import {
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  tenantBase,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000716',
  slug: 'qa-analytics-716',
  name: 'QA Analytics 716',
  // Nothing is created under this slug — the tenant sits on the real `pro`
  // plan, which is what makes analytics `advanced` (revenue reporting at all).
  // The field only tells `destroyQaTenant` which throwaway plan row to remove.
  planSlug: 'e2e-unused-analytics-716',
}
const QA_BASE = tenantBase(QA.slug)

const PRODUCT_A = '[E2E] #716 Course Bundle'
const PRODUCT_B = '[E2E] #716 Masterclass'

/** What the ledger above adds up to, as the pages format it. */
const EXPECTED = {
  gross: '$310.00',
  platformFees: '$50.00',
  net: '$260.00',
  countedSales: 3,
  byProductA: '$160.00',
  byProductB: '$150.00',
  /** tenant_users: owner (admin) + two students. */
  members: '3',
  enrollments: '3',
  /** Students with a lesson completion in the last 30 days. */
  activeStudents: '2',
  lessonCompletions: '3',
  examSubmissions: '1',
  /** (2/2 + 1/2 + 0/1) / 3 enrollments. */
  completionRate: '50.0%',
} as const

let productA: number
let productB: number
let courseOne: number
let courseTwo: number

async function insertProduct(admin: SupabaseClient, name: string, price: number): Promise<number> {
  const { data, error } = await admin
    .from('products')
    .insert({
      name,
      description: 'Analytics arithmetic fixture (#716)',
      price,
      currency: 'usd',
      status: 'active',
      tenant_id: QA.id,
    })
    .select('product_id')
    .single()
  if (error) throw new Error(`could not insert product ${name}: ${error.message}`)
  return data.product_id as number
}

async function insertCourse(admin: SupabaseClient, title: string): Promise<number> {
  const { data, error } = await admin
    .from('courses')
    .insert({ title, tenant_id: QA.id, author_id: SEEDED.owner.id, status: 'published', description: '#716' })
    .select('course_id')
    .single()
  if (error) throw new Error(`could not insert course ${title}: ${error.message}`)
  return data.course_id as number
}

async function insertLesson(admin: SupabaseClient, courseId: number, title: string): Promise<number> {
  const { data, error } = await admin
    .from('lessons')
    .insert({ title, course_id: courseId, tenant_id: QA.id, status: 'published' })
    .select('id')
    .single()
  if (error) throw new Error(`could not insert lesson ${title}: ${error.message}`)
  return data.id as number
}

/** Delete in FK order, then hand the tenant itself to the shared teardown. */
async function destroyFixtures(admin: SupabaseClient) {
  const { data: courses } = await admin.from('courses').select('course_id').eq('tenant_id', QA.id)
  const courseIds = (courses ?? []).map((c) => c.course_id)
  if (courseIds.length > 0) {
    const { data: lessons } = await admin.from('lessons').select('id').in('course_id', courseIds)
    const lessonIds = (lessons ?? []).map((l) => l.id)
    if (lessonIds.length > 0) await admin.from('lesson_completions').delete().in('lesson_id', lessonIds)
    await admin.from('exam_submissions').delete().eq('tenant_id', QA.id)
    await admin.from('exams').delete().eq('tenant_id', QA.id)
    await admin.from('lessons').delete().in('course_id', courseIds)
  }
  // Transactions reference the products, so they go first.
  await admin.from('transactions').delete().eq('tenant_id', QA.id)
  await admin.from('products').delete().eq('tenant_id', QA.id)
  await destroyQaTenant(admin, QA)
}

test.describe.configure({ mode: 'serial' })

test.describe('analytics arithmetic (#716)', () => {
  test.beforeAll(async () => {
    const admin = getAdmin()
    await destroyFixtures(admin)
    // `pro` → analytics tier `advanced`, i.e. the revenue chart renders at all.
    await createQaTenant(admin, QA, 'pro')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')
    await addMember(admin, QA.id, SEEDED.alice.id, 'student')

    // BEFORE the ledger: the #512 backstop trigger stamps
    // `school_percentage_snapshot` from this row at INSERT and freezes it.
    const { error: splitError } = await admin
      .from('revenue_splits')
      .upsert({ tenant_id: QA.id, school_percentage: 80, platform_percentage: 20 }, { onConflict: 'tenant_id' })
    if (splitError) throw new Error(`could not write the split: ${splitError.message}`)

    productA = await insertProduct(admin, PRODUCT_A, 100)
    productB = await insertProduct(admin, PRODUCT_B, 200)

    // Two days ago: inside every period the page offers, including 7 days.
    const when = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    // Every row carries `refunded_amount` explicitly: in a batch insert
    // PostgREST fills the union of keys, so a row that omits the column is sent
    // an explicit NULL and trips its NOT NULL constraint.
    const { error: ledgerError } = await admin.from('transactions').insert([
      { user_id: SEEDED.owner.id, tenant_id: QA.id, product_id: productA, amount: '100.00', refunded_amount: '0.00', currency: 'usd', status: 'successful', payment_provider: 'stripe', payment_method: 'card', transaction_date: when },
      { user_id: SEEDED.student.id, tenant_id: QA.id, product_id: productA, amount: '60.00', refunded_amount: '0.00', currency: 'usd', status: 'successful', payment_provider: 'manual', payment_method: 'bank_transfer', transaction_date: when },
      { user_id: SEEDED.owner.id, tenant_id: QA.id, product_id: productB, amount: '200.00', refunded_amount: '50.00', currency: 'usd', status: 'successful', payment_provider: 'stripe', payment_method: 'card', transaction_date: when },
      { user_id: SEEDED.student.id, tenant_id: QA.id, product_id: productB, amount: '80.00', refunded_amount: '80.00', currency: 'usd', status: 'refunded', payment_provider: 'stripe', payment_method: 'card', transaction_date: when },
    ])
    if (ledgerError) throw new Error(`could not write the ledger: ${ledgerError.message}`)

    // Learning activity: course 1 has two lessons, course 2 one.
    courseOne = await insertCourse(admin, '[E2E] #716 Course One')
    courseTwo = await insertCourse(admin, '[E2E] #716 Course Two')
    const lessonOne = await insertLesson(admin, courseOne, '[E2E] #716 Lesson 1')
    const lessonTwo = await insertLesson(admin, courseOne, '[E2E] #716 Lesson 2')
    await insertLesson(admin, courseTwo, '[E2E] #716 Lesson 3')

    const { error: enrollError } = await admin.from('enrollments').insert([
      { user_id: SEEDED.student.id, course_id: courseOne, tenant_id: QA.id, status: 'active' },
      { user_id: SEEDED.alice.id, course_id: courseOne, tenant_id: QA.id, status: 'active' },
      { user_id: SEEDED.student.id, course_id: courseTwo, tenant_id: QA.id, status: 'active' },
    ])
    if (enrollError) throw new Error(`could not enrol: ${enrollError.message}`)

    // student finished course one (2/2), alice is half way (1/2), and nobody
    // has touched course two — so the average completion rate is 50.0%.
    const { error: completionError } = await admin.from('lesson_completions').insert([
      { user_id: SEEDED.student.id, lesson_id: lessonOne, completed_at: when },
      { user_id: SEEDED.student.id, lesson_id: lessonTwo, completed_at: when },
      { user_id: SEEDED.alice.id, lesson_id: lessonOne, completed_at: when },
    ])
    if (completionError) throw new Error(`could not complete lessons: ${completionError.message}`)

    const { data: exam, error: examError } = await admin
      .from('exams')
      .insert({ title: '[E2E] #716 Exam', course_id: courseOne, tenant_id: QA.id, duration: 30, status: 'published' })
      .select('exam_id')
      .single()
    if (examError) throw new Error(`could not insert the exam: ${examError.message}`)
    const { error: submissionError } = await admin
      .from('exam_submissions')
      .insert({ exam_id: exam.exam_id, student_id: SEEDED.student.id, tenant_id: QA.id, submission_date: when })
    if (submissionError) throw new Error(`could not submit the exam: ${submissionError.message}`)
  })

  test.afterAll(async () => {
    await destroyFixtures(getAdmin())
  })

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — the ledger is shared DB state')
    test.setTimeout(120_000)
    await login(page, SEEDED.owner.email, SEEDED.owner.password, QA_BASE)
  })

  test('the revenue page reports gross, fees and net to the cent', async ({ page }) => {
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/revenue`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('revenue-page')).toBeVisible({ timeout: 20_000 })

    // 310.00, not 360.00: the partial refund is netted out, the full refund is gone.
    await expect(page.getByTestId('revenue-total')).toHaveText(EXPECTED.gross)
    // 50.00, not 62.00: the manual sale bears no platform fee.
    await expect(page.getByTestId('revenue-platform-fees')).toHaveText(EXPECTED.platformFees)
    await expect(page.getByTestId('revenue-net')).toHaveText(EXPECTED.net)
    await expect(page.getByTestId('revenue-transaction-count')).toContainText(String(EXPECTED.countedSales))
  })

  test('revenue by product splits the same money between the two products', async ({ page }) => {
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/revenue`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('revenue-page')).toBeVisible({ timeout: 20_000 })

    await expect(page.getByTestId('revenue-by-product-row')).toHaveCount(2)
    await expect(page.getByTestId(`revenue-by-product-${productA}`)).toHaveText(EXPECTED.byProductA)
    await expect(page.getByTestId(`revenue-by-product-${productB}`)).toHaveText(EXPECTED.byProductB)
    await expect(page.getByText(PRODUCT_A)).toBeVisible()
    await expect(page.getByText(PRODUCT_B)).toBeVisible()
  })

  test('the analytics page reports the same revenue as the revenue page', async ({ page }) => {
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/analytics?period=30`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('analytics-page')).toBeVisible({ timeout: 20_000 })

    // Two screens, one ledger: they must agree, or one of them is lying (#547).
    await expect(page.getByTestId('analytics-total-revenue')).toHaveText(EXPECTED.gross)
    await expect(page.getByTestId('analytics-total-users')).toHaveText(EXPECTED.members)
  })

  test('engagement metrics count real learning activity, not zeros', async ({ page }) => {
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/analytics?period=30`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('analytics-page')).toBeVisible({ timeout: 20_000 })

    await expect(page.getByTestId('engagement-enrollments')).toHaveText(EXPECTED.enrollments)
    // Both of these read `lesson_completions`, the table with no `tenant_id`.
    // They were `0` for every school until #716 — the bug this spec exists for.
    await expect(page.getByTestId('engagement-active-students')).toHaveText(EXPECTED.activeStudents)
    await expect(page.getByTestId('engagement-lesson-completions')).toHaveText(EXPECTED.lessonCompletions)
    await expect(page.getByTestId('engagement-exam-submissions')).toHaveText(EXPECTED.examSubmissions)
    // 0% until the enrollment query started selecting the `user_id` it filters on.
    await expect(page.getByTestId('engagement-completion-rate')).toHaveText(EXPECTED.completionRate)
  })

  test('course popularity ranks the courses and rates each one', async ({ page }) => {
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/analytics?period=30`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('analytics-page')).toBeVisible({ timeout: 20_000 })

    // The whole chart was empty for every school until #716: the courses query
    // embedded `lessons(lesson_id)`, and `lessons` is keyed by `id`.
    await expect(page.getByTestId(`course-popularity-enrollments-${courseOne}`)).toContainText('2')
    // (2/2 + 1/2) / 2 enrolled students.
    await expect(page.getByTestId(`course-popularity-completion-${courseOne}`)).toHaveText('75%')
    await expect(page.getByTestId(`course-popularity-enrollments-${courseTwo}`)).toContainText('1')
    await expect(page.getByTestId(`course-popularity-completion-${courseTwo}`)).toHaveText('0%')
  })

  test('the admin dashboard stat cards agree with the revenue page', async ({ page }) => {
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('admin-stats-grid')).toBeVisible({ timeout: 20_000 })

    await expect(page.getByTestId('admin-stat-revenue')).toHaveText(EXPECTED.gross)
    await expect(page.getByTestId('admin-stat-users')).toHaveText(EXPECTED.members)
    await expect(page.getByTestId('admin-stat-courses')).toHaveText('2')
  })

  test('another school never sees this ledger', async ({ page }) => {
    // The same admin account also administers the Default School; every figure
    // above is tenant-scoped arithmetic, so the seeded tenant must not move.
    await page.goto(`${QA_BASE}/${LOCALE}/dashboard/admin/revenue`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('revenue-total')).toHaveText(EXPECTED.gross)

    const admin = getAdmin()
    const { data: leaked } = await admin
      .from('transactions')
      .select('transaction_id')
      .neq('tenant_id', QA.id)
      .in('product_id', [productA, productB])
    expect(leaked ?? []).toHaveLength(0)
  })
})
