/**
 * Exam grading over Bearer + save_exam_feedback lockdown — issue #839.
 *
 * The native app cannot call the `gradeExamWithAI` server action, so
 * `POST /api/exams/:examId/grade` exposes the same grader (lib/exams/grade.ts)
 * over cookie or Bearer auth. The body carries only the submission id; the
 * answers come from `exam_answers`, and a graded submission is refused.
 *
 * `save_exam_feedback` is SECURITY DEFINER and trusts every argument. It was
 * executable by `authenticated` and `anon`, so a student could hand themselves
 * 100%. It is service-role only now.
 *
 * Closed questions only, so grading needs no AI provider.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { ACCOUNTS, BASE } from './utils/constants'

const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const ALICE = { email: 'alice@student.com', password: 'password123' }

const COURSE_TITLE = '[E2E] 839 Grading Course'
const EXAM_TITLE = '[E2E] 839 Grading Exam'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function signIn(account: { email: string; password: string }) {
  const client = anonClient()
  const { data, error } = await client.auth.signInWithPassword(account)
  expect(error).toBeNull()
  return { client, token: data.session!.access_token }
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

let examId: number
let mcQuestionId: number
let tfQuestionId: number
let rightOptionId: number

test.describe.configure({ mode: 'serial' })

test.describe('Exam grading route (#839)', () => {
  test.beforeAll(async () => {
    await cleanup()
    const admin = getAdmin()

    const { data: course, error: courseError } = await admin
      .from('courses')
      .insert({ title: COURSE_TITLE, description: '#839 fixture', tenant_id: CODE_ACADEMY_TENANT, status: 'published', author_id: CREATOR_ID })
      .select('course_id')
      .single()
    expect(courseError).toBeNull()

    const { error: entitlementError } = await admin.from('entitlements').insert({
      user_id: ALICE_ID,
      course_id: course!.course_id,
      tenant_id: CODE_ACADEMY_TENANT,
      source_type: 'admin_grant',
      status: 'active',
    })
    expect(entitlementError).toBeNull()

    const { data: exam, error: examError } = await admin
      .from('exams')
      .insert({ title: EXAM_TITLE, description: '#839 fixture', course_id: course!.course_id, duration: 30, tenant_id: CODE_ACADEMY_TENANT, status: 'published' })
      .select('exam_id')
      .single()
    expect(examError).toBeNull()
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
      .select('option_id, is_correct')
    rightOptionId = options!.find((o) => o.is_correct)!.option_id

    const { data: tf } = await admin
      .from('exam_questions')
      .insert({ exam_id: examId, question_text: 'The sky is green', question_type: 'true_false', points: 10, correct_answer: 'false' })
      .select('question_id')
      .single()
    tfQuestionId = tf!.question_id
  })

  test.afterAll(cleanup)

  test('save_exam_feedback is not executable by anon or a student', async () => {
    const args = {
      p_submission_id: 1,
      p_exam_id: examId,
      p_student_id: ALICE_ID,
      p_answers: {},
      p_overall_feedback: 'self-graded',
      p_score: 100,
      p_question_feedback: {},
      p_ai_model: 'none',
      p_processing_time_ms: 0,
    }
    const { error: anonError } = await anonClient().rpc('save_exam_feedback', args)
    expect(anonError?.message).toMatch(/permission denied/i)

    const { client } = await signIn(ALICE)
    const { error: studentError } = await client.rpc('save_exam_feedback', args)
    expect(studentError?.message).toMatch(/permission denied/i)
  })

  test('grades the stored answers over Bearer, then refuses a regrade', async () => {
    const { client, token } = await signIn(ALICE)

    const { data: submission, error: submissionError } = await client
      .from('exam_submissions')
      .insert({ exam_id: examId, student_id: ALICE_ID, tenant_id: CODE_ACADEMY_TENANT })
      .select('submission_id')
      .single()
    expect(submissionError).toBeNull()
    const submissionId = submission!.submission_id

    // MC right, TF wrong → 50%.
    const { error: answersError } = await client.from('exam_answers').insert([
      { submission_id: submissionId, question_id: mcQuestionId, answer_text: String(rightOptionId) },
      { submission_id: submissionId, question_id: tfQuestionId, answer_text: 'true' },
    ])
    expect(answersError).toBeNull()

    const url = `${BASE}/api/exams/${examId}/grade`
    const post = (body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${token}` }) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

    expect((await post({ submissionId }, {})).status).toBe(401)
    expect((await post({})).status).toBe(400)
    // A submission id that exists but belongs to a different exam path.
    expect((await fetch(`${BASE}/api/exams/${examId + 1000000}/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ submissionId }),
    })).status).toBe(404)

    // Answers in the body are ignored: only exam_answers is graded.
    const res = await post({ submissionId, answers: { [tfQuestionId]: 'false' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.score).toBe(50)
    expect(body.question_feedback[mcQuestionId].is_correct).toBe(true)
    expect(body.question_feedback[tfQuestionId].is_correct).toBe(false)

    const { data: score } = await getAdmin()
      .from('exam_scores')
      .select('score')
      .eq('submission_id', submissionId)
      .single()
    expect(Number(score!.score)).toBe(50)

    expect((await post({ submissionId })).status).toBe(409)
  })

  test("another student cannot grade alice's submission", async () => {
    const admin = getAdmin()
    const { data: sub } = await admin
      .from('exam_submissions')
      .select('submission_id')
      .eq('exam_id', examId)
      .eq('student_id', ALICE_ID)
      .single()
    const { token } = await signIn(ACCOUNTS.student)
    const res = await fetch(`${BASE}/api/exams/${examId}/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ submissionId: sub!.submission_id }),
    })
    expect(res.status).toBe(404)
  })
})

