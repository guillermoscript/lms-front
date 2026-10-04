/**
 * Exam answer keys are staff-only — issue #840.
 *
 * `exam_questions` / `question_options` are readable by anyone sitting the
 * exam, so the key (`correct_answer`, `grading_rubric`, `ai_grading_criteria`,
 * `expected_keywords`, `is_correct`) moved to `exam_grading_secrets`. BEFORE
 * triggers strip it off every write; a NULL on a write keeps the stored value
 * (every client reads NULL), '' clears.
 *
 * A student sees the right answer only through `get_exam_answer_key`, for
 * their own submission, once it is graded.
 *
 * DB-level only: every call goes through a role-`authenticated` client, the
 * surface a student's browser or app holds.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { ACCOUNTS } from './utils/constants'

const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'

const COURSE_TITLE = '[E2E] 840 Secrets Course'
const EXAM_TITLE = '[E2E] 840 Secrets Exam'
const SECRET_ANSWER = 'false'
const SECRET_RUBRIC = 'the-rubric-must-not-leak'

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

async function signIn(account: { email: string; password: string }): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword(account)
  expect(error).toBeNull()
  return client
}

async function cleanup() {
  const admin = getAdmin()
  const { data: exams } = await admin.from('exams').select('exam_id').eq('title', EXAM_TITLE)
  for (const exam of exams ?? []) {
    const { data: subs } = await admin.from('exam_submissions').select('submission_id').eq('exam_id', exam.exam_id)
    for (const sub of subs ?? []) {
      await admin.from('exam_answers').delete().eq('submission_id', sub.submission_id)
    }
    await admin.from('exam_submissions').delete().eq('exam_id', exam.exam_id)
    await admin.from('exam_questions').delete().eq('exam_id', exam.exam_id)
  }
  await admin.from('exams').delete().eq('title', EXAM_TITLE)
  const { data: courses } = await admin.from('courses').select('course_id').eq('title', COURSE_TITLE)
  for (const course of courses ?? []) {
    await admin.from('entitlements').delete().eq('course_id', course.course_id)
  }
  await admin.from('courses').delete().eq('title', COURSE_TITLE)
}

async function secretsOf(questionId: number) {
  const { data, error } = await getAdmin()
    .from('exam_grading_secrets')
    .select('correct_answer, grading_rubric, ai_grading_criteria, expected_keywords, correct_option_ids')
    .eq('question_id', questionId)
    .single()
  expect(error).toBeNull()
  return data!
}

let examId: number
let mcQuestionId: number
let tfQuestionId: number
let rightOptionId: number
let wrongOptionId: number
let submissionId: number
let alice: SupabaseClient
let staff: SupabaseClient

test.describe.configure({ mode: 'serial' })

test.describe('Exam grading secrets (#840)', () => {
  test.beforeAll(async () => {
    await cleanup()
    const admin = getAdmin()

    const { data: course, error: courseError } = await admin
      .from('courses')
      .insert({ title: COURSE_TITLE, description: '#840 fixture', tenant_id: CODE_ACADEMY_TENANT, status: 'published', author_id: CREATOR_ID })
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
      .insert({ title: EXAM_TITLE, description: '#840 fixture', course_id: course!.course_id, duration: 30, tenant_id: CODE_ACADEMY_TENANT, status: 'published' })
      .select('exam_id')
      .single()
    expect(examError).toBeNull()
    examId = exam!.exam_id

    const { data: mc, error: mcError } = await admin
      .from('exam_questions')
      .insert({
        exam_id: examId,
        question_text: 'Pick the right one',
        question_type: 'multiple_choice',
        grading_rubric: SECRET_RUBRIC,
        ai_grading_criteria: 'criteria',
        expected_keywords: ['key'],
      })
      .select('question_id, grading_rubric')
      .single()
    expect(mcError).toBeNull()
    // Stripped on the way in, even for the service role.
    expect(mc!.grading_rubric).toBeNull()
    mcQuestionId = mc!.question_id

    const { data: options } = await admin
      .from('question_options')
      .insert([
        { question_id: mcQuestionId, option_text: 'Right', is_correct: true },
        { question_id: mcQuestionId, option_text: 'Wrong', is_correct: false },
      ])
      .select('option_id, option_text, is_correct')
    expect(options!.every((o) => o.is_correct === null)).toBe(true)
    rightOptionId = options!.find((o) => o.option_text === 'Right')!.option_id
    wrongOptionId = options!.find((o) => o.option_text === 'Wrong')!.option_id

    const { data: tf } = await admin
      .from('exam_questions')
      .insert({ exam_id: examId, question_text: 'The sky is green', question_type: 'true_false', correct_answer: SECRET_ANSWER })
      .select('question_id')
      .single()
    tfQuestionId = tf!.question_id

    alice = await signIn(ACCOUNTS.tenantStudent)
    staff = await signIn(ACCOUNTS.admin)
  })

  test.afterAll(cleanup)

  test('the key is stored in exam_grading_secrets', async () => {
    const mc = await secretsOf(mcQuestionId)
    expect(mc.grading_rubric).toBe(SECRET_RUBRIC)
    expect(mc.ai_grading_criteria).toBe('criteria')
    expect(mc.expected_keywords).toEqual(['key'])
    expect(mc.correct_option_ids).toEqual([rightOptionId])
    expect((await secretsOf(tfQuestionId)).correct_answer).toBe(SECRET_ANSWER)
  })

  test('a student reads the questions but no key, and nothing from the side table', async () => {
    const { data: questions, error } = await alice
      .from('exam_questions')
      .select('question_id, correct_answer, grading_rubric, ai_grading_criteria, expected_keywords, question_options(option_id, is_correct)')
      .eq('exam_id', examId)
    expect(error).toBeNull()
    expect(questions).toHaveLength(2)
    for (const q of questions!) {
      expect(q.correct_answer).toBeNull()
      expect(q.grading_rubric).toBeNull()
      expect(q.ai_grading_criteria).toBeNull()
      expect(q.expected_keywords).toBeNull()
      for (const o of q.question_options as { is_correct: boolean | null }[]) expect(o.is_correct).toBeNull()
    }

    const { data: secrets, error: secretsError } = await alice
      .from('exam_grading_secrets')
      .select('question_id')
      .eq('exam_id', examId)
    expect(secretsError).toBeNull()
    expect(secrets).toEqual([])
  })

  test('staff read the key through the embed', async () => {
    const { data, error } = await staff
      .from('exam_questions')
      .select('question_id, exam_grading_secrets(grading_rubric, correct_option_ids)')
      .eq('question_id', mcQuestionId)
      .single()
    expect(error).toBeNull()
    const secrets = data!.exam_grading_secrets as unknown as { grading_rubric: string; correct_option_ids: number[] }
    expect(secrets.grading_rubric).toBe(SECRET_RUBRIC)
    expect(secrets.correct_option_ids).toEqual([rightOptionId])
  })

  test('a save-back of a loaded row keeps the key; an explicit value changes it', async () => {
    // What an editor that loaded the stripped row sends back: NULLs.
    const { error: questionError } = await staff
      .from('exam_questions')
      .update({ question_text: 'Pick the right one!', grading_rubric: null, expected_keywords: null })
      .eq('question_id', mcQuestionId)
    expect(questionError).toBeNull()
    const { error: optionError } = await staff
      .from('question_options')
      .update({ option_text: 'Right!', is_correct: null })
      .eq('option_id', rightOptionId)
    expect(optionError).toBeNull()

    let mc = await secretsOf(mcQuestionId)
    expect(mc.grading_rubric).toBe(SECRET_RUBRIC)
    expect(mc.expected_keywords).toEqual(['key'])
    expect(mc.correct_option_ids).toEqual([rightOptionId])

    // '' / '{}' clear; true/false move the flag.
    await staff.from('exam_questions').update({ ai_grading_criteria: '', expected_keywords: [] }).eq('question_id', mcQuestionId)
    await staff.from('question_options').update({ is_correct: true }).eq('option_id', wrongOptionId)
    await staff.from('question_options').update({ is_correct: false }).eq('option_id', rightOptionId)
    mc = await secretsOf(mcQuestionId)
    expect(mc.ai_grading_criteria).toBeNull()
    expect(mc.expected_keywords).toBeNull()
    expect(mc.grading_rubric).toBe(SECRET_RUBRIC)
    expect(mc.correct_option_ids).toEqual([wrongOptionId])

    // Back to the fixture's key for the RPC tests.
    await staff.from('question_options').update({ is_correct: true }).eq('option_id', rightOptionId)
    await staff.from('question_options').update({ is_correct: false }).eq('option_id', wrongOptionId)
    expect((await secretsOf(mcQuestionId)).correct_option_ids).toEqual([rightOptionId])
  })

  test('get_exam_answer_key: nothing before grading, the answer after, only for the owner', async () => {
    const { data: submitted, error: submissionError } = await alice.rpc('submit_exam', {
      p_exam_id: examId,
      p_answers: {},
    })
    expect(submissionError).toBeNull()
    submissionId = submitted!

    const { error: anonError } = await anonClient().rpc('get_exam_answer_key', { p_submission_id: submissionId })
    expect(anonError?.message).toMatch(/permission denied/i)

    const before = await alice.rpc('get_exam_answer_key', { p_submission_id: submissionId })
    expect(before.error).toBeNull()
    expect(before.data).toEqual([])

    const { error: gradeError } = await getAdmin()
      .from('exam_submissions')
      .update({ review_status: 'ai_reviewed', score: 50 })
      .eq('submission_id', submissionId)
    expect(gradeError).toBeNull()

    const after = await alice.rpc('get_exam_answer_key', { p_submission_id: submissionId })
    expect(after.error).toBeNull()
    const rows = after.data as { question_id: number; correct_answer: string | null; correct_option_ids: number[] }[]
    expect(rows).toHaveLength(2)
    // The right answer only — never the rubric, criteria or keywords.
    expect(Object.keys(rows[0]).sort()).toEqual(['correct_answer', 'correct_option_ids', 'question_id'])
    expect(rows.find((r) => r.question_id === mcQuestionId)!.correct_option_ids).toEqual([rightOptionId])
    expect(rows.find((r) => r.question_id === tfQuestionId)!.correct_answer).toBe(SECRET_ANSWER)

    const otherStudent = await signIn(ACCOUNTS.student)
    const other = await otherStudent.rpc('get_exam_answer_key', { p_submission_id: submissionId })
    expect(other.error).toBeNull()
    expect(other.data).toEqual([])
  })
})
