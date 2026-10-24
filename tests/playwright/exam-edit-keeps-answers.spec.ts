/**
 * Editing an exam that students already sat keeps their answers.
 *
 * The builder used to save by deleting every `exam_questions` row and
 * re-inserting it; the ON DELETE CASCADE took `exam_answers`,
 * `exam_question_scores` and `exam_grading_secrets` with it and gave every
 * question a new id. Now kept questions are updated in place, and a question a
 * student answered can't be removed.
 */
import { test, expect } from './utils/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { login } from './utils/auth'
import { ACCOUNTS, LOCALE, TENANT_BASE } from './utils/constants'

const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'

const COURSE_TITLE = '[E2E] Exam edit keeps answers course'
const EXAM_TITLE = '[E2E] Exam edit keeps answers'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function cleanup() {
  const admin = getAdmin()
  const { data: exams } = await admin.from('exams').select('exam_id').eq('title', EXAM_TITLE)
  for (const exam of exams ?? []) {
    await admin.from('exam_submissions').delete().eq('exam_id', exam.exam_id)
    await admin.from('exam_questions').delete().eq('exam_id', exam.exam_id)
  }
  await admin.from('exams').delete().eq('title', EXAM_TITLE)
  await admin.from('courses').delete().eq('title', COURSE_TITLE)
}

test.describe('Exam builder edit keeps student answers', () => {
  let courseId: number
  let examId: number
  let mcId: number
  let freeId: number
  let unansweredId: number
  let rightOptionId: number

  test.beforeAll(async () => {
    await cleanup()
    const admin = getAdmin()

    const { data: course, error: courseError } = await admin
      .from('courses')
      .insert({ title: COURSE_TITLE, description: 'fixture', tenant_id: CODE_ACADEMY_TENANT, status: 'published', author_id: CREATOR_ID })
      .select('course_id')
      .single()
    expect(courseError).toBeNull()
    courseId = course!.course_id

    const { data: exam } = await admin
      .from('exams')
      .insert({ title: EXAM_TITLE, description: 'fixture', course_id: courseId, duration: 30, sequence: 1, tenant_id: CODE_ACADEMY_TENANT, status: 'published' })
      .select('exam_id')
      .single()
    examId = exam!.exam_id

    const { data: questions, error: qError } = await admin
      .from('exam_questions')
      .insert([
        { exam_id: examId, sequence: 1, question_text: 'Pick the right one', question_type: 'multiple_choice', ai_grading_criteria: 'criteria' },
        { exam_id: examId, sequence: 2, question_text: 'Explain tuples', question_type: 'free_text' },
        { exam_id: examId, sequence: 3, question_text: 'Nobody answered me', question_type: 'free_text' },
      ])
      .select('question_id, question_text')
    expect(qError).toBeNull()
    const byText = (t: string) => questions!.find((q) => q.question_text === t)!.question_id
    mcId = byText('Pick the right one')
    freeId = byText('Explain tuples')
    unansweredId = byText('Nobody answered me')

    const { data: options } = await admin
      .from('question_options')
      .insert([
        { question_id: mcId, option_text: 'Right', is_correct: true },
        { question_id: mcId, option_text: 'Wrong', is_correct: false },
      ])
      .select('option_id, option_text')
    rightOptionId = options!.find((o) => o.option_text === 'Right')!.option_id

    const { data: submission, error: subError } = await admin
      .from('exam_submissions')
      .insert({ exam_id: examId, student_id: ALICE_ID, tenant_id: CODE_ACADEMY_TENANT, review_status: 'pending' })
      .select('submission_id')
      .single()
    expect(subError).toBeNull()

    const { error: answersError } = await admin.from('exam_answers').insert([
      { submission_id: submission!.submission_id, question_id: mcId, answer_text: String(rightOptionId) },
      { submission_id: submission!.submission_id, question_id: freeId, answer_text: 'Tuples are immutable' },
    ])
    expect(answersError).toBeNull()

    const { error: scoresError } = await admin.from('exam_question_scores').insert([
      { submission_id: submission!.submission_id, question_id: mcId, points_earned: 10, points_possible: 10 },
      { submission_id: submission!.submission_id, question_id: freeId, points_earned: 5, points_possible: 10 },
    ])
    expect(scoresError).toBeNull()
  })

  test.afterAll(cleanup)

  test('editing question text keeps ids, answers, scores and the key', async ({ page }) => {
    await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password, TENANT_BASE)
    await page.goto(`${TENANT_BASE}/${LOCALE}/dashboard/teacher/courses/${courseId}/exams/${examId}`, {
      waitUntil: 'domcontentloaded',
    })

    const texts = page.getByPlaceholder('Write your question...')
    await expect(texts).toHaveCount(3)
    await expect(texts.nth(0)).toHaveValue('Pick the right one')

    // Answered questions can't be removed; the unanswered one can.
    const answeredRemove = page.getByRole('button', { name: /students have answered this question/i })
    await expect(answeredRemove).toHaveCount(2)
    await expect(answeredRemove.first()).toBeDisabled()

    await texts.nth(0).fill('Pick the right one (edited)')
    await page.getByRole('button', { name: /^remove question$/i }).evaluate((b: HTMLButtonElement) => b.click())
    await expect(texts).toHaveCount(2)

    await page.getByRole('button', { name: /^publish$/i }).first().evaluate((b: HTMLButtonElement) => b.click())
    await page.waitForURL(/\/courses\/\d+\?tab=exams/, { timeout: 30_000 })

    const admin = getAdmin()
    const { data: questions } = await admin
      .from('exam_questions')
      .select('question_id, question_text, sequence')
      .eq('exam_id', examId)
      .order('sequence')
    expect(questions).toEqual([
      { question_id: mcId, question_text: 'Pick the right one (edited)', sequence: 1 },
      { question_id: freeId, question_text: 'Explain tuples', sequence: 2 },
    ])
    expect(questions!.some((q) => q.question_id === unansweredId)).toBe(false)

    const { count: answers } = await admin
      .from('exam_answers')
      .select('*', { count: 'exact', head: true })
      .in('question_id', [mcId, freeId])
    expect(answers).toBe(2)

    const { count: scores } = await admin
      .from('exam_question_scores')
      .select('*', { count: 'exact', head: true })
      .in('question_id', [mcId, freeId])
    expect(scores).toBe(2)

    const { data: secrets } = await admin
      .from('exam_grading_secrets')
      .select('correct_option_ids, ai_grading_criteria')
      .eq('question_id', mcId)
      .single()
    expect(secrets).toEqual({ correct_option_ids: [rightOptionId], ai_grading_criteria: 'criteria' })
  })
})
