/**
 * Atomic exam submit + retry of a failed grading — issue #847.
 *
 * Clients used to insert `exam_submissions` and `exam_answers` as two
 * requests. When the second failed, the submission stayed behind and the
 * UNIQUE (exam_id, student_id) locked the student out for good. The direct
 * inserts also trusted `score` / `review_status`, so a student could hand
 * themselves 100% or open the answer key before answering.
 *
 * `submit_exam(exam_id, answers)` is now the only client write path: one
 * transaction, idempotent per student, and it fills in a submission left
 * without answers. A submission still `pending` on the result page (grading
 * failed) offers "Retry grading".
 *
 * Closed questions only, so grading needs no AI provider.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsTenantStudent } from './utils/auth'
import { TENANT_BASE } from './utils/constants'

const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const ALICE = { email: 'alice@student.com', password: 'password123' }

const COURSE_TITLE = '[E2E] 847 Submit Course'
const EXAM_TITLE = '[E2E] 847 Submit Exam'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function asAlice() {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await client.auth.signInWithPassword(ALICE)
  expect(error).toBeNull()
  return client
}

async function cleanup() {
  const admin = getAdmin()
  const { data: exams } = await admin.from('exams').select('exam_id').eq('title', EXAM_TITLE)
  for (const exam of exams ?? []) {
    const { data: subs } = await admin.from('exam_submissions').select('submission_id').eq('exam_id', exam.exam_id)
    for (const sub of subs ?? []) {
      await admin.from('exam_question_scores').delete().eq('submission_id', sub.submission_id)
      await admin.from('exam_scores').delete().eq('submission_id', sub.submission_id)
      await admin.from('exam_answers').delete().eq('submission_id', sub.submission_id)
    }
    await admin.from('certificates').delete().eq('exam_id', exam.exam_id)
    await admin.from('exam_submissions').delete().eq('exam_id', exam.exam_id)
    const { data: questions } = await admin.from('exam_questions').select('question_id').eq('exam_id', exam.exam_id)
    for (const q of questions ?? []) {
      await admin.from('question_options').delete().eq('question_id', q.question_id)
    }
    await admin.from('exam_questions').delete().eq('exam_id', exam.exam_id)
  }
  await admin.from('exams').delete().eq('title', EXAM_TITLE)
  const { data: courses } = await admin.from('courses').select('course_id').eq('title', COURSE_TITLE)
  for (const course of courses ?? []) {
    await admin.from('entitlements').delete().eq('course_id', course.course_id)
  }
  await admin.from('courses').delete().eq('title', COURSE_TITLE)
}

let courseId: number
let examId: number
let mcQuestionId: number
let tfQuestionId: number
let rightOptionId: number

/** Alice's submission for the fixture exam, if any, with its answers. */
async function aliceSubmission() {
  const { data } = await getAdmin()
    .from('exam_submissions')
    .select('submission_id, score, review_status, exam_answers (question_id, answer_text)')
    .eq('exam_id', examId)
    .eq('student_id', ALICE_ID)
    .maybeSingle()
  return data
}

async function resetAliceSubmission() {
  const admin = getAdmin()
  const existing = await aliceSubmission()
  if (!existing) return
  await admin.from('exam_question_scores').delete().eq('submission_id', existing.submission_id)
  await admin.from('exam_scores').delete().eq('submission_id', existing.submission_id)
  await admin.from('exam_answers').delete().eq('submission_id', existing.submission_id)
  await admin.from('exam_submissions').delete().eq('submission_id', existing.submission_id)
}

test.describe('Atomic exam submit (#847)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await cleanup()
    const admin = getAdmin()

    const { data: course, error: courseError } = await admin
      .from('courses')
      .insert({ title: COURSE_TITLE, description: '#847 fixture', tenant_id: CODE_ACADEMY_TENANT, status: 'published', author_id: CREATOR_ID })
      .select('course_id')
      .single()
    expect(courseError).toBeNull()
    courseId = course!.course_id

    const { error: entitlementError } = await admin.from('entitlements').insert({
      user_id: ALICE_ID,
      course_id: courseId,
      tenant_id: CODE_ACADEMY_TENANT,
      source_type: 'admin_grant',
      status: 'active',
    })
    expect(entitlementError).toBeNull()

    const { data: exam } = await admin
      .from('exams')
      .insert({ title: EXAM_TITLE, description: '#847 fixture', course_id: courseId, duration: 30, tenant_id: CODE_ACADEMY_TENANT, status: 'published' })
      .select('exam_id')
      .single()
    examId = exam!.exam_id

    const { data: mc } = await admin
      .from('exam_questions')
      .insert({ exam_id: examId, question_text: 'Pick the right one', question_type: 'multiple_choice', points: 10 })
      .select('question_id')
      .single()
    mcQuestionId = mc!.question_id
    const { data: options } = await admin
      .from('question_options')
      .insert([
        { question_id: mcQuestionId, option_text: 'Right', is_correct: true },
        { question_id: mcQuestionId, option_text: 'Wrong', is_correct: false },
      ])
      .select('option_id, option_text')
    rightOptionId = options!.find((o) => o.option_text === 'Right')!.option_id

    const { data: tf } = await admin
      .from('exam_questions')
      .insert({ exam_id: examId, question_text: 'The sky is green', question_type: 'true_false', points: 10, correct_answer: 'false' })
      .select('question_id')
      .single()
    tfQuestionId = tf!.question_id
  })

  test.afterAll(cleanup)

  test('a student cannot write exam_submissions or exam_answers directly', async () => {
    const alice = await asAlice()

    // The shape that used to self-grade: a scored, reviewed submission.
    const { error: submissionError } = await alice
      .from('exam_submissions')
      .insert({ exam_id: examId, student_id: ALICE_ID, tenant_id: CODE_ACADEMY_TENANT, score: 100, review_status: 'teacher_reviewed' })
    expect(submissionError?.code).toBe('42501')

    const { error: answersError } = await alice
      .from('exam_answers')
      .insert({ submission_id: 1, question_id: mcQuestionId, answer_text: 'x' })
    expect(answersError?.code).toBe('42501')

    expect(await aliceSubmission()).toBeNull()
  })

  test('submit_exam refuses answers that are not an object', async () => {
    const alice = await asAlice()
    const { error } = await alice.rpc('submit_exam', { p_exam_id: examId, p_answers: [] })
    expect(error?.code).toBe('22023')
    expect(await aliceSubmission()).toBeNull()
  })

  test('writes the submission and one answer per question, then is idempotent', async () => {
    const alice = await asAlice()

    const { data: first, error } = await alice.rpc('submit_exam', {
      p_exam_id: examId,
      // The TF question is left unanswered; 999999 is not a question of this exam.
      p_answers: { [mcQuestionId]: String(rightOptionId), 999999: 'stray' },
    })
    expect(error).toBeNull()
    expect(first).toBeTruthy()

    let row = await aliceSubmission()
    expect(row!.submission_id).toBe(first)
    expect(row!.score).toBeNull()
    expect(row!.review_status).toBe('pending')
    const byQuestion = Object.fromEntries(row!.exam_answers.map((a) => [a.question_id, a.answer_text]))
    expect(byQuestion).toEqual({ [mcQuestionId]: String(rightOptionId), [tfQuestionId]: '' })

    // A second submit (a retry after a network error, a second tab) returns
    // the same submission and does not rewrite what was handed in.
    const { data: second, error: secondError } = await alice.rpc('submit_exam', {
      p_exam_id: examId,
      p_answers: { [mcQuestionId]: 'changed', [tfQuestionId]: 'true' },
    })
    expect(secondError).toBeNull()
    expect(second).toBe(first)
    row = await aliceSubmission()
    expect(row!.exam_answers).toHaveLength(2)
    expect(Object.fromEntries(row!.exam_answers.map((a) => [a.question_id, a.answer_text]))).toEqual(byQuestion)
  })

  test('a submission left without answers is filled in, not locked out', async () => {
    await resetAliceSubmission()
    // What the old two-request flow left behind when the answers insert failed.
    const { data: orphan } = await getAdmin()
      .from('exam_submissions')
      .insert({ exam_id: examId, student_id: ALICE_ID, tenant_id: CODE_ACADEMY_TENANT })
      .select('submission_id')
      .single()

    const alice = await asAlice()
    const { data, error } = await alice.rpc('submit_exam', {
      p_exam_id: examId,
      p_answers: { [mcQuestionId]: String(rightOptionId), [tfQuestionId]: 'true' },
    })
    expect(error).toBeNull()
    expect(data).toBe(orphan!.submission_id)
    const row = await aliceSubmission()
    expect(row!.exam_answers).toHaveLength(2)
  })

  test('a pending result offers Retry grading, which grades it', async ({ page }) => {
    // Same state as the previous test: submitted (MC right, TF wrong), never graded.
    const pending = await aliceSubmission()
    expect(pending!.review_status).toBe('pending')

    await loginAsTenantStudent(page)
    await page.goto(`${TENANT_BASE}/en/dashboard/student/courses/${courseId}/exams/${examId}/result`)

    const banner = page.getByTestId('exam-grading-failed')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText("Your exam hasn't been graded yet")

    // base-ui Buttons swallow Playwright clicks now and then; click in the page.
    await page.getByTestId('exam-retry-grading').evaluate((b: HTMLButtonElement) => b.click())

    await expect(banner).toBeHidden({ timeout: 30_000 })
    const graded = await aliceSubmission()
    expect(graded!.review_status).toBe('ai_reviewed')
    expect(Number(graded!.score)).toBe(50)
    await expect(page.getByText('50%').first()).toBeVisible()
  })
})
