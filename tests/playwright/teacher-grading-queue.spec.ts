/**
 * Teacher grading queue — a student submits an exam with an open-ended
 * answer, the teacher reviews it, overrides the score, and the student sees
 * the new grade (#674).
 *
 * Self-contained `[E2E] Grading` fixture on Code Academy, seeded in
 * `beforeAll` and removed in `afterAll`: one course, a $0 product, a free
 * entitlement for alice@student.com, and two exams —
 *
 *   - "Queue Exam": two multiple-choice questions (5 pts each) and one
 *     free-text question (10 pts). An `exam_ai_configs` row switches AI
 *     grading OFF, so `gradeExamWithAI` takes its deterministic branch:
 *     MC auto-graded, free-text parked at 0 pts / confidence 0 /
 *     `pending_teacher_review`. No model key is needed, which is what lets
 *     this run in CI.
 *   - "Ungraded Exam": a bare `exam_submissions` row inserted directly with
 *     `score = NULL`, modelling a submission whose grading never ran. It
 *     exists to pin PRODUCT.md principle 5 — ungraded shows as ungraded,
 *     never as 0%.
 *
 * Flow:
 *   1. Alice answers MC1 right, MC2 wrong, writes a free-text answer, submits
 *      → /result shows 25%, "Pending Teacher Review", the free-text card is
 *      "Pending Review" with no points badge.
 *   2. The creator opens the submissions list, sees Alice's row, opens it,
 *      grades the free-text question 8/10 as Correct with a note, saves.
 *   3. DB: exam_question_scores / exam_scores / exam_submissions carry the
 *      override (8 pts, is_overridden, 65%, teacher_reviewed).
 *   4. Alice reloads /result → 65%, "Teacher Reviewed", 8/10 pts, the note.
 *   5. The ungraded submission renders "—" on the teacher list, N/A / — in
 *      the teacher header, and is not presented as 0% to the student.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TENANT_BASE as BASE, LOCALE, ACCOUNTS } from './utils/constants'
import { login } from './utils/auth'
import { getServiceRoleClient, CODE_ACADEMY_TENANT, ALICE_ID } from './utils/seed-state'

const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003' // creator@codeacademy.com
const FIXTURE_PREFIX = '[E2E] Grading'
const RUN = Date.now()

const FREE_TEXT_ANSWER =
  'A list is mutable and a tuple is immutable; use a tuple for fixed records such as coordinates.'
const TEACHER_NOTE = `Good distinction, mention hashability next time (${RUN})`
const OVERRIDE_POINTS = 8
/** 5 (MC1 right) + 0 (MC2 wrong) + 0 (free text pending) out of 20 */
const SCORE_BEFORE = 25
/** 5 + 0 + 8 out of 20 */
const SCORE_AFTER = 65

/* ------------------------------------------------------------------ */
/*  Fixture ids (filled by beforeAll)                                  */
/* ------------------------------------------------------------------ */
let courseId: number
let productId: number
let examId: number
let ungradedExamId: number
let ungradedSubmissionId: number
let mcRight: { question_id: number; text: string; correctOptionId: number }
let mcWrong: { question_id: number; text: string; wrongOptionId: number; correctOptionText: string }
let freeText: { question_id: number; text: string }

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data as NonNullable<T>
}

/* ------------------------------------------------------------------ */
/*  Seed / clean                                                       */
/* ------------------------------------------------------------------ */
async function removeStaleFixtures(admin: SupabaseClient) {
  const { data: courses } = await admin
    .from('courses')
    .select('course_id')
    .eq('tenant_id', CODE_ACADEMY_TENANT)
    .like('title', `${FIXTURE_PREFIX}%`)
  for (const c of courses ?? []) {
    // exam_submissions does not cascade from exams; delete them first.
    const { data: exams } = await admin.from('exams').select('exam_id').eq('course_id', c.course_id)
    for (const e of exams ?? []) {
      await admin.from('exam_submissions').delete().eq('exam_id', e.exam_id)
    }
    await admin.from('courses').delete().eq('course_id', c.course_id)
  }
  await admin.from('products').delete().eq('tenant_id', CODE_ACADEMY_TENANT).like('name', `${FIXTURE_PREFIX}%`)
}

test.beforeAll(async () => {
  const admin = getServiceRoleClient()
  await removeStaleFixtures(admin)

  const course = must(
    await admin
      .from('courses')
      .insert({
        title: `${FIXTURE_PREFIX} — Grading Queue Course ${RUN}`,
        description: 'Seeded by teacher-grading-queue.spec.ts. Safe to delete.',
        status: 'published',
        author_id: CREATOR_ID,
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('course_id')
      .single(),
    'seed course'
  )
  courseId = course.course_id

  const product = must(
    await admin
      .from('products')
      .insert({
        name: `${FIXTURE_PREFIX} Free Product ${RUN}`,
        description: 'Free access to the grading-queue course.',
        price: 0,
        currency: 'usd',
        status: 'active',
        payment_provider: 'manual',
        tenant_id: CODE_ACADEMY_TENANT,
      })
      .select('product_id')
      .single(),
    'seed product'
  )
  productId = product.product_id
  must(
    await admin
      .from('product_courses')
      .insert({ product_id: productId, course_id: courseId, tenant_id: CODE_ACADEMY_TENANT })
      .select('product_id'),
    'seed product_courses'
  )

  // Access lives in entitlements (#509); a free grant needs no source row.
  must(
    await admin
      .from('entitlements')
      .insert({
        user_id: ALICE_ID,
        course_id: courseId,
        tenant_id: CODE_ACADEMY_TENANT,
        source_type: 'free',
        status: 'active',
      })
      .select('entitlement_id'),
    'seed entitlement'
  )

  const exams = must(
    await admin
      .from('exams')
      .insert([
        {
          course_id: courseId,
          title: `${FIXTURE_PREFIX} Queue Exam`,
          description: 'Two multiple-choice questions and one open-ended answer.',
          exam_date: '2030-12-31T23:59:00Z',
          duration: 30,
          status: 'published',
          sequence: 1,
          created_by: CREATOR_ID,
          tenant_id: CODE_ACADEMY_TENANT,
        },
        {
          course_id: courseId,
          title: `${FIXTURE_PREFIX} Ungraded Exam`,
          description: 'A submission that was never graded.',
          exam_date: '2030-12-31T23:59:00Z',
          duration: 30,
          status: 'published',
          sequence: 2,
          created_by: CREATOR_ID,
          tenant_id: CODE_ACADEMY_TENANT,
        },
      ])
      .select('exam_id, title'),
    'seed exams'
  )
  examId = exams.find((e) => e.title.endsWith('Queue Exam'))!.exam_id
  ungradedExamId = exams.find((e) => e.title.endsWith('Ungraded Exam'))!.exam_id

  // AI grading OFF for this exam: free-text answers wait for the teacher.
  must(
    await admin
      .from('exam_ai_configs')
      .insert({ exam_id: examId, ai_grading_enabled: false })
      .select('config_id'),
    'seed exam_ai_configs'
  )

  const questions = must(
    await admin
      .from('exam_questions')
      .insert([
        { exam_id: examId, question_text: 'Which keyword defines a function in Python?', question_type: 'multiple_choice', points: 5 },
        { exam_id: examId, question_text: 'Which built-in type is immutable?', question_type: 'multiple_choice', points: 5 },
        { exam_id: examId, question_text: 'Explain the difference between a list and a tuple.', question_type: 'free_text', points: 10 },
        { exam_id: ungradedExamId, question_text: 'Is Python dynamically typed?', question_type: 'true_false', points: 10 },
      ])
      .select('question_id, exam_id, question_text, question_type'),
    'seed exam questions'
  )
  const q1 = questions.find((q) => q.question_text.startsWith('Which keyword'))!
  const q2 = questions.find((q) => q.question_text.startsWith('Which built-in'))!
  const q3 = questions.find((q) => q.question_type === 'free_text')!
  const q4 = questions.find((q) => q.exam_id === ungradedExamId)!

  const options = must(
    await admin
      .from('question_options')
      .insert([
        { question_id: q1.question_id, option_text: 'def', is_correct: true },
        { question_id: q1.question_id, option_text: 'func', is_correct: false },
        { question_id: q2.question_id, option_text: 'list', is_correct: false },
        { question_id: q2.question_id, option_text: 'tuple', is_correct: true },
        { question_id: q4.question_id, option_text: 'True', is_correct: true },
        { question_id: q4.question_id, option_text: 'False', is_correct: false },
      ])
      .select('option_id, question_id, option_text, is_correct'),
    'seed question options'
  )
  mcRight = {
    question_id: q1.question_id,
    text: q1.question_text,
    correctOptionId: options.find((o) => o.question_id === q1.question_id && o.is_correct)!.option_id,
  }
  mcWrong = {
    question_id: q2.question_id,
    text: q2.question_text,
    wrongOptionId: options.find((o) => o.question_id === q2.question_id && !o.is_correct)!.option_id,
    correctOptionText: options.find((o) => o.question_id === q2.question_id && o.is_correct)!.option_text,
  }
  freeText = { question_id: q3.question_id, text: q3.question_text }

  // A submission that never reached grading: no answers, no scores, no status.
  const ungraded = must(
    await admin
      .from('exam_submissions')
      .insert({ exam_id: ungradedExamId, student_id: ALICE_ID, tenant_id: CODE_ACADEMY_TENANT })
      .select('submission_id')
      .single(),
    'seed ungraded submission'
  )
  ungradedSubmissionId = ungraded.submission_id
})

test.afterAll(async () => {
  // Leave the rows behind for a manual look (screenshots, DB poking); the
  // next run's removeStaleFixtures() sweeps them.
  if (process.env.E2E_KEEP_FIXTURE) {
    console.log(`grading-queue: keeping fixture course ${courseId} / exams ${examId}, ${ungradedExamId} / submission ${ungradedSubmissionId}`)
    return
  }
  const admin = getServiceRoleClient()
  const warn = (what: string) => (res: { error: { message: string } | null }) => {
    if (res.error) console.warn(`grading-queue cleanup: ${what}: ${res.error.message}`)
  }
  // Submissions first (no cascade from exams); scores/answers cascade from them.
  for (const id of [examId, ungradedExamId]) {
    if (id) await admin.from('exam_submissions').delete().eq('exam_id', id).then(warn(`submissions ${id}`))
  }
  if (courseId) await admin.from('courses').delete().eq('course_id', courseId).then(warn('course'))
  if (productId) await admin.from('products').delete().eq('product_id', productId).then(warn('product'))
})

/* ------------------------------------------------------------------ */
/*  Page helpers                                                       */
/* ------------------------------------------------------------------ */

/** base-ui buttons intermittently swallow Playwright clicks; click in-page. */
async function domClick(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.first().waitFor({ state: 'visible', timeout: 30_000 })
  await locator.first().evaluate((el) => (el as HTMLElement).click())
}

/** Fill a React-controlled field and prove the value survived hydration. */
async function fillSettled(page: Page, locator: ReturnType<Page['locator']>, value: string) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 })
  await expect
    .poll(
      async () => {
        await locator.fill(value)
        await page.waitForTimeout(400)
        return locator.inputValue()
      },
      { timeout: 30_000, intervals: [500, 1000] }
    )
    .toBe(value)
}

/**
 * Wait until React has hydrated an element — it stamps `__reactProps$…` on the
 * node when it attaches handlers. A click that lands before that is lost.
 */
async function waitHydrated(locator: ReturnType<Page['locator']>) {
  await locator.first().waitFor({ state: 'visible', timeout: 60_000 })
  await expect
    .poll(
      () => locator.first().evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))),
      { timeout: 60_000, intervals: [250, 500, 1000] }
    )
    .toBe(true)
}

/** Pick a radio option by its label and prove the radio took it. */
async function pickOption(page: Page, optionId: number) {
  const label = page.locator(`label[for="option-${optionId}"]`)
  await waitHydrated(label)
  await expect
    .poll(
      async () => {
        await domClick(page, label)
        await page.waitForTimeout(250)
        // The `id` lands on the hidden native input; the a11y state is on the
        // base-ui `[role="radio"]` span inside the label.
        return label.locator('[role="radio"]').getAttribute('aria-checked')
      },
      { timeout: 30_000, intervals: [500, 1000] }
    )
    .toBe('true')
}

/** Press "Next Question" until the heading shows the expected question. */
async function goNext(page: Page, expectedHeading: string) {
  const next = page.getByRole('button', { name: /next question/i })
  await waitHydrated(next)
  await expect
    .poll(
      async () => {
        await domClick(page, next)
        await page.waitForTimeout(250)
        return page.locator('h2').first().textContent()
      },
      { timeout: 30_000, intervals: [500, 1000] }
    )
    .toContain(expectedHeading)
}

const submissionsUrl = () => `${BASE}/${LOCALE}/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`
const resultUrl = (exam: number) => `${BASE}/${LOCALE}/dashboard/student/courses/${courseId}/exams/${exam}/result`

/* ------------------------------------------------------------------ */
/*  The journey                                                        */
/* ------------------------------------------------------------------ */
test.describe('Teacher grading queue (#674)', () => {
  test.describe.configure({ mode: 'serial' })

  let studentCtx: BrowserContext
  let teacherCtx: BrowserContext
  let student: Page
  let teacher: Page

  test.beforeAll(async ({ browser }) => {
    // Contexts made here do not inherit the project's `video` setting; set
    // E2E_RECORD_DIR to get one .webm per role (the PR GIF comes from it).
    const recordVideo = process.env.E2E_RECORD_DIR
      ? { dir: process.env.E2E_RECORD_DIR, size: { width: 1280, height: 800 } }
      : undefined
    studentCtx = await browser.newContext({ recordVideo, viewport: { width: 1280, height: 800 } })
    teacherCtx = await browser.newContext({ recordVideo, viewport: { width: 1280, height: 800 } })
    student = await studentCtx.newPage()
    teacher = await teacherCtx.newPage()
  })

  test.afterAll(async () => {
    await studentCtx?.close()
    await teacherCtx?.close()
  })

  test('student submits an exam with an open-ended answer and sees it pending review', async () => {
    test.setTimeout(300_000)
    await login(student, ACCOUNTS.tenantStudent.email, ACCOUNTS.tenantStudent.password, BASE)

    await student.goto(`${BASE}/${LOCALE}/dashboard/student/courses/${courseId}/exams/${examId}`, {
      waitUntil: 'domcontentloaded',
    })
    const submit = student.getByTestId('exam-finish-submit')

    // Questions come in question_id order: MC right, MC wrong, free text.
    await expect(student.locator('h2')).toContainText(mcRight.text, { timeout: 60_000 })
    await pickOption(student, mcRight.correctOptionId)
    await goNext(student, mcWrong.text)
    await pickOption(student, mcWrong.wrongOptionId)
    await goNext(student, freeText.text)
    await fillSettled(student, student.locator('textarea'), FREE_TEXT_ANSWER)

    await expect(submit).toBeVisible({ timeout: 30_000 })
    await domClick(student, submit)
    await student.waitForURL(/\/exams\/\d+\/result/, { timeout: 180_000 })

    const body = student.locator('body')
    await expect(body).toContainText(`${SCORE_BEFORE}%`, { timeout: 60_000 })
    await expect(body).toContainText('Pending Teacher Review')
    // The free-text answer is parked, not scored: "Pending Review", no points badge.
    await expect(body).toContainText('Pending Review')
    await expect(body).not.toContainText('0/10 pts')
    await expect(body).toContainText(FREE_TEXT_ANSWER)

    // DB: the deterministic branch parked the free-text answer at 0 / confidence 0.
    const admin = getServiceRoleClient()
    const { data: sub } = await admin
      .from('exam_submissions')
      .select('submission_id, score, review_status, requires_attention')
      .eq('exam_id', examId)
      .eq('student_id', ALICE_ID)
      .single()
    expect(sub?.review_status).toBe('pending_teacher_review')
    expect(sub?.requires_attention).toBe(true)
    expect(Number(sub?.score)).toBe(SCORE_BEFORE)
    const { data: parked } = await admin
      .from('exam_question_scores')
      .select('points_earned, ai_confidence, is_overridden')
      .eq('submission_id', sub!.submission_id)
      .eq('question_id', freeText.question_id)
      .single()
    expect(Number(parked?.points_earned)).toBe(0)
    expect(Number(parked?.ai_confidence)).toBe(0)
    expect(parked?.is_overridden).toBeFalsy()
  })

  test('teacher opens the queue, reviews the submission and overrides the open-ended score', async () => {
    test.setTimeout(300_000)
    await login(teacher, ACCOUNTS.admin.email, ACCOUNTS.admin.password, BASE)

    await teacher.goto(submissionsUrl(), { waitUntil: 'domcontentloaded' })
    const row = teacher.getByRole('row').filter({ hasText: 'Alice' })
    await expect(row).toBeVisible({ timeout: 60_000 })
    await expect(row).toContainText(`${SCORE_BEFORE}%`)

    await domClick(teacher, row.getByRole('link', { name: /review/i }))
    await teacher.waitForURL(/\/submissions\/\d+$/, { timeout: 60_000 })

    const body = teacher.locator('body')
    await expect(body).toContainText('Submission Review', { timeout: 60_000 })
    await expect(body).toContainText(`${SCORE_BEFORE}%`)

    // The wrong MC card shows what was picked and what was right.
    const wrongCard = teacher.locator('[data-slot="card"]', { hasText: mcWrong.text })
    await expect(wrongCard).toContainText('0/5')
    await expect(wrongCard).toContainText('Selected')
    await expect(wrongCard).toContainText(mcWrong.correctOptionText)

    // The free-text card carries the student's answer and the parked 0/10.
    const freeCard = teacher.locator('[data-slot="card"]', { hasText: freeText.text })
    await expect(freeCard).toContainText(FREE_TEXT_ANSWER)
    await expect(freeCard).toContainText('0/10')

    // Override: open the editor, set points, mark correct, leave a note, close.
    await domClick(teacher, freeCard.getByRole('button', { name: /^(grade|override)$/i }))
    await fillSettled(teacher, freeCard.locator('input[type="number"]'), String(OVERRIDE_POINTS))
    await domClick(teacher, freeCard.getByRole('button', { name: /^correct$/i }))
    await fillSettled(teacher, freeCard.locator('textarea'), TEACHER_NOTE)
    await domClick(teacher, freeCard.getByRole('button', { name: /^done$/i }))
    await expect(freeCard).toContainText(`${OVERRIDE_POINTS}/10`)
    await expect(freeCard).toContainText('Overridden')

    await domClick(teacher, teacher.getByRole('button', { name: /save & finalize review/i }))
    // The server action redirects back to the list once the scores are written.
    await teacher.waitForURL(/\/submissions$/, { timeout: 120_000 })

    const graded = teacher.getByRole('row').filter({ hasText: 'Alice' })
    await expect(graded).toBeVisible({ timeout: 60_000 })
    await expect(graded).toContainText(`${SCORE_AFTER}%`)
    await expect(graded).toContainText('Graded')
  })

  test('the override is persisted in exam_question_scores, exam_scores and exam_submissions', async () => {
    const admin = getServiceRoleClient()
    const { data: sub } = await admin
      .from('exam_submissions')
      .select('submission_id, score, review_status, requires_attention')
      .eq('exam_id', examId)
      .eq('student_id', ALICE_ID)
      .single()
    expect(sub?.review_status).toBe('teacher_reviewed')
    expect(sub?.requires_attention).toBe(false)
    expect(Number(sub?.score)).toBe(SCORE_AFTER)

    const { data: qs } = await admin
      .from('exam_question_scores')
      .select('points_earned, points_possible, is_correct, is_overridden, teacher_id, teacher_notes')
      .eq('submission_id', sub!.submission_id)
      .eq('question_id', freeText.question_id)
      .single()
    expect(Number(qs?.points_earned)).toBe(OVERRIDE_POINTS)
    expect(Number(qs?.points_possible)).toBe(10)
    expect(qs?.is_correct).toBe(true)
    expect(qs?.is_overridden).toBe(true)
    expect(qs?.teacher_id).toBe(CREATOR_ID)
    expect(qs?.teacher_notes).toBe(TEACHER_NOTE)

    // The untouched MC rows keep their auto-graded points.
    const { data: mc } = await admin
      .from('exam_question_scores')
      .select('question_id, points_earned')
      .eq('submission_id', sub!.submission_id)
      .in('question_id', [mcRight.question_id, mcWrong.question_id])
    const byId = Object.fromEntries((mc ?? []).map((r) => [r.question_id, Number(r.points_earned)]))
    expect(byId[mcRight.question_id]).toBe(5)
    expect(byId[mcWrong.question_id]).toBe(0)

    const { data: es } = await admin
      .from('exam_scores')
      .select('score, is_overridden, teacher_id')
      .eq('submission_id', sub!.submission_id)
      .single()
    expect(Number(es?.score)).toBe(SCORE_AFTER)
    expect(es?.is_overridden).toBe(true)
    expect(es?.teacher_id).toBe(CREATOR_ID)
  })

  test('student sees the overridden grade and the teacher note', async () => {
    test.setTimeout(180_000)
    await student.goto(resultUrl(examId), { waitUntil: 'domcontentloaded' })
    const body = student.locator('body')
    await expect(body).toContainText(`${SCORE_AFTER}%`, { timeout: 60_000 })
    await expect(body).toContainText('Teacher Reviewed')
    await expect(body).not.toContainText('Pending Teacher Review')
    await expect(body).toContainText(`${OVERRIDE_POINTS}/10 pts`)
    await expect(body).toContainText('Teacher reviewed')
    await expect(body).toContainText(TEACHER_NOTE)
    // Once the teacher graded it, the free-text answer is no longer pending.
    await expect(body).not.toContainText('Pending Review')
  })

  test('an ungraded submission shows as ungraded, not as 0 (PRODUCT.md principle 5)', async () => {
    test.setTimeout(180_000)

    // Teacher list: both score cells are a dash.
    await teacher.goto(
      `${BASE}/${LOCALE}/dashboard/teacher/courses/${courseId}/exams/${ungradedExamId}/submissions`,
      { waitUntil: 'domcontentloaded' }
    )
    const row = teacher.getByRole('row').filter({ hasText: 'Alice' })
    await expect(row).toBeVisible({ timeout: 60_000 })
    await expect(row).not.toContainText('0%')
    await expect(row.getByRole('cell').filter({ hasText: '—' })).toHaveCount(2)

    // Teacher detail header: no score is not a zero score.
    await teacher.goto(
      `${BASE}/${LOCALE}/dashboard/teacher/courses/${courseId}/exams/${ungradedExamId}/submissions/${ungradedSubmissionId}`,
      { waitUntil: 'domcontentloaded' }
    )
    const header = teacher.locator('body')
    await expect(header).toContainText('Submission Review', { timeout: 60_000 })
    await expect(header).toContainText('N/A')
    await expect(header).not.toContainText('0%')

    // Student result page: not "0%".
    await student.goto(resultUrl(ungradedExamId), { waitUntil: 'domcontentloaded' })
    const body = student.locator('body')
    await expect(body).toContainText('Final Score', { timeout: 60_000 })
    await expect(body).not.toContainText('0%')
  })
})
