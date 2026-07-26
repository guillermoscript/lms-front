/**
 * Exam answer key + lesson comment RLS — issue #542 (EPIC #540 §1.2).
 *
 * `exam_questions` and `question_options` were created `USING (true)` by
 * 20260313152048 and left behind when #509 gated their parent `exams`, so any
 * authenticated user of any tenant could read `correct_answer`,
 * `grading_rubric`, `ai_grading_criteria` and `is_correct` straight over
 * PostgREST. `lesson_comments` was the same shape. 20260726100000 routes all
 * three through their parent (they carry no `tenant_id` of their own) and
 * converges the #509 authenticated preview branch with the anon one.
 *
 * Every read here goes through a role-`authenticated` client — exactly what a
 * browser holds — rather than through a page, because the hole was the REST
 * surface itself, not any screen.
 *
 * The positive cases matter as much as the negative ones: the exam editor,
 * teacher grading and the AI grading path in `app/actions/exam-grading.ts` all
 * read these tables through user-scoped clients, so a missing staff or
 * entitlement branch breaks grading rather than failing safe.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { ACCOUNTS } from './utils/constants'

const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003' // Code Academy admin, author
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004' // Code Academy student

// Every fixture below is seeded by this spec rather than taken from
// `supabase/seed.sql`, so the entitlement branches assert against state this
// file owns end to end and a neighbouring suite revoking a seeded entitlement
// cannot turn a positive case into a false failure.
const GATED_COURSE_TITLE = '[E2E] 542 Gated Course'
const GATED_EXAM_TITLE = '[E2E] 542 Gated Exam'
const ENTITLED_COURSE_TITLE = '[E2E] 542 Entitled Course'
const ENTITLED_EXAM_TITLE = '[E2E] 542 Entitled Exam'
const ENTITLED_LESSON_TITLE = '[E2E] 542 Entitled Lesson'
const DRAFT_COURSE_TITLE = '[E2E] 542 Draft Course'
const PREVIEW_LESSON_TITLE = '[E2E] 542 Preview Lesson'
const COMMENT_BODY = '[E2E] 542 tenant-scoped comment'

const SECRET_ANSWER = 'the-answer-key-must-not-leak'
const SECRET_RUBRIC = 'the-rubric-must-not-leak'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** A user-scoped client — role `authenticated`, tenant claims from the JWT hook. */
async function signIn(account: { email: string; password: string }) {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await client.auth.signInWithPassword(account)
  expect(error, `sign-in failed for ${account.email}`).toBeNull()
  return client
}

/**
 * Anonymous client — role `anon`, no session. Carries the `x-tenant-id` header
 * `proxy.ts` injects on a tenant subdomain, since `get_tenant_id()` falls back
 * to the default tenant for claim-less callers and the fixture lives in
 * Code Academy.
 */
function getAnon() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'x-tenant-id': CODE_ACADEMY_TENANT } },
    }
  )
}

const COURSE_TITLES = [GATED_COURSE_TITLE, ENTITLED_COURSE_TITLE, DRAFT_COURSE_TITLE]
const EXAM_TITLES = [GATED_EXAM_TITLE, ENTITLED_EXAM_TITLE]
const LESSON_TITLES = [ENTITLED_LESSON_TITLE, PREVIEW_LESSON_TITLE]

let gatedExamId: number
let gatedQuestionId: number
let entitledExamId: number
let entitledQuestionId: number
let draftCourseId: number
let previewLessonId: number
let commentLessonId: number
let commentId: number

let otherTenantStudent: SupabaseClient
let tenantStudent: SupabaseClient
let tenantStaff: SupabaseClient

async function cleanup() {
  const admin = getAdmin()
  await admin.from('lesson_comments').delete().eq('content', COMMENT_BODY)

  const { data: staleExams } = await admin.from('exams').select('exam_id').in('title', EXAM_TITLES)
  for (const exam of staleExams ?? []) {
    const { data: questions } = await admin
      .from('exam_questions')
      .select('question_id')
      .eq('exam_id', exam.exam_id)
    for (const question of questions ?? []) {
      await admin.from('question_options').delete().eq('question_id', question.question_id)
    }
    await admin.from('exam_questions').delete().eq('exam_id', exam.exam_id)
  }
  await admin.from('exams').delete().in('title', EXAM_TITLES)

  await admin.from('lessons').delete().in('title', LESSON_TITLES)

  const { data: staleCourses } = await admin
    .from('courses')
    .select('course_id')
    .in('title', COURSE_TITLES)
  for (const course of staleCourses ?? []) {
    await admin.from('entitlements').delete().eq('course_id', course.course_id)
  }
  await admin.from('courses').delete().in('title', COURSE_TITLES)
}

/** A published Code Academy course authored by the tenant admin. */
async function seedCourse(title: string, status: 'published' | 'draft') {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('courses')
    .insert({
      title,
      description: 'Issue #542 regression fixture.',
      tenant_id: CODE_ACADEMY_TENANT,
      status,
      author_id: CREATOR_ID,
    })
    .select('course_id')
    .single()
  expect(error, `seed course ${title}`).toBeNull()
  return data!.course_id as number
}

/** An exam with one question carrying an answer key, and two options. */
async function seedExam(courseId: number, title: string) {
  const admin = getAdmin()
  const { data: exam, error: examError } = await admin
    .from('exams')
    .insert({
      title,
      description: 'Issue #542 regression fixture.',
      course_id: courseId,
      duration: 30,
      tenant_id: CODE_ACADEMY_TENANT,
      status: 'published',
    })
    .select('exam_id')
    .single()
  expect(examError, `seed exam ${title}`).toBeNull()
  const examId = exam!.exam_id as number

  const { data: question, error: questionError } = await admin
    .from('exam_questions')
    .insert({
      exam_id: examId,
      question_text: 'Which one is the answer?',
      question_type: 'multiple_choice',
      points: 10,
      correct_answer: SECRET_ANSWER,
      grading_rubric: SECRET_RUBRIC,
      ai_grading_criteria: 'Award full marks for the exact phrase.',
      expected_keywords: ['answer', 'key'],
    })
    .select('question_id')
    .single()
  expect(questionError, `seed question for ${title}`).toBeNull()
  const questionId = question!.question_id as number

  const { error: optionsError } = await admin.from('question_options').insert([
    { question_id: questionId, option_text: 'Right', is_correct: true },
    { question_id: questionId, option_text: 'Wrong', is_correct: false },
  ])
  expect(optionsError, `seed options for ${title}`).toBeNull()

  return { examId, questionId }
}

test.beforeAll(async () => {
  const admin = getAdmin()
  await cleanup()

  // A Code Academy course nobody holds an entitlement for, authored by the
  // Code Academy admin so the author branch cannot be what lets alice in.
  // A Code Academy course nobody holds an entitlement for.
  const gatedCourseId = await seedCourse(GATED_COURSE_TITLE, 'published')
  ;({ examId: gatedExamId, questionId: gatedQuestionId } = await seedExam(
    gatedCourseId,
    GATED_EXAM_TITLE
  ))

  // The same shape, but alice holds a live entitlement — the branch the exam
  // taker and the AI grading path depend on.
  const entitledCourseId = await seedCourse(ENTITLED_COURSE_TITLE, 'published')
  ;({ examId: entitledExamId, questionId: entitledQuestionId } = await seedExam(
    entitledCourseId,
    ENTITLED_EXAM_TITLE
  ))

  const { error: entitlementError } = await admin.from('entitlements').insert({
    user_id: ALICE_ID,
    course_id: entitledCourseId,
    tenant_id: CODE_ACADEMY_TENANT,
    source_type: 'admin_grant',
    status: 'active',
  })
  expect(entitlementError).toBeNull()

  // A lesson in that entitled course, carrying a comment thread.
  const { data: entitledLesson, error: entitledLessonError } = await admin
    .from('lessons')
    .insert({
      course_id: entitledCourseId,
      title: ENTITLED_LESSON_TITLE,
      content: 'Body alice is entitled to.',
      tenant_id: CODE_ACADEMY_TENANT,
      status: 'published',
      is_preview: false,
      sequence: 1,
    })
    .select('id')
    .single()
  expect(entitledLessonError).toBeNull()
  commentLessonId = Number(entitledLesson!.id)

  const { data: comment, error: commentError } = await admin
    .from('lesson_comments')
    .insert({ lesson_id: commentLessonId, user_id: ALICE_ID, content: COMMENT_BODY })
    .select('id')
    .single()
  expect(commentError).toBeNull()
  commentId = Number(comment!.id)

  // Draft course carrying a published preview lesson — the #509 overshoot.
  draftCourseId = await seedCourse(DRAFT_COURSE_TITLE, 'draft')

  const { data: lesson, error: lessonError } = await admin
    .from('lessons')
    .insert({
      course_id: draftCourseId,
      title: PREVIEW_LESSON_TITLE,
      content: 'Unpublished course body that must not leak.',
      tenant_id: CODE_ACADEMY_TENANT,
      status: 'published',
      is_preview: true,
      sequence: 1,
    })
    .select('id')
    .single()
  expect(lessonError).toBeNull()
  previewLessonId = Number(lesson!.id)

  otherTenantStudent = await signIn(ACCOUNTS.student) // Default School
  tenantStudent = await signIn(ACCOUNTS.tenantStudent) // alice, Code Academy
  tenantStaff = await signIn(ACCOUNTS.admin) // creator, Code Academy admin
})

test.afterAll(async () => {
  await cleanup()
})

test.describe('exam answer key is not world-readable (#542)', () => {
  test('a member of another tenant reads zero questions and zero options', async () => {
    const { data: questions, error: questionsError } = await otherTenantStudent
      .from('exam_questions')
      .select('question_id, correct_answer, grading_rubric')
      .in('exam_id', [entitledExamId, gatedExamId])
    expect(questionsError).toBeNull()
    expect(questions).toEqual([])

    const { data: options, error: optionsError } = await otherTenantStudent
      .from('question_options')
      .select('option_id, is_correct')
      .eq('question_id', gatedQuestionId)
    expect(optionsError).toBeNull()
    expect(options).toEqual([])
  })

  test('a member of the owning tenant with no entitlement reads zero questions and zero options', async () => {
    const { data: questions, error: questionsError } = await tenantStudent
      .from('exam_questions')
      .select('question_id, correct_answer, grading_rubric')
      .eq('exam_id', gatedExamId)
    expect(questionsError).toBeNull()
    expect(questions).toEqual([])

    const { data: options, error: optionsError } = await tenantStudent
      .from('question_options')
      .select('option_id, is_correct')
      .eq('question_id', gatedQuestionId)
    expect(optionsError).toBeNull()
    expect(options).toEqual([])
  })

  test('an unscoped sweep of the whole table leaks nothing across tenants', async () => {
    // The hole was reachable without knowing any id at all.
    const { data, error } = await otherTenantStudent
      .from('exam_questions')
      .select('question_id, correct_answer')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('staff of the owning tenant still read questions, options and rubrics', async () => {
    const { data: questions, error: questionsError } = await tenantStaff
      .from('exam_questions')
      .select('question_id, correct_answer, grading_rubric, ai_grading_criteria')
      .eq('exam_id', gatedExamId)
    expect(questionsError).toBeNull()
    expect(questions).toHaveLength(1)
    expect(questions![0].correct_answer).toBe(SECRET_ANSWER)
    expect(questions![0].grading_rubric).toBe(SECRET_RUBRIC)

    const { data: options, error: optionsError } = await tenantStaff
      .from('question_options')
      .select('option_id, option_text, is_correct')
      .eq('question_id', gatedQuestionId)
    expect(optionsError).toBeNull()
    expect(options).toHaveLength(2)
    expect(options!.some((o) => o.is_correct)).toBe(true)
  })

  test('an entitled student still reads the exam they are sitting', async () => {
    // The AI grading path reads correct_answer/rubric through the student's own
    // client, so this is the branch that breaks grading if it regresses.
    const { data, error } = await tenantStudent
      .from('exams')
      .select(
        'exam_id, exam_questions(question_id, correct_answer, question_options(option_id, is_correct))'
      )
      .eq('exam_id', entitledExamId)
      .single()
    expect(error).toBeNull()

    const questions = data!.exam_questions as {
      question_id: number
      correct_answer: string | null
      question_options: unknown[]
    }[]
    expect(questions).toHaveLength(1)
    expect(questions[0].question_id).toBe(entitledQuestionId)
    expect(questions[0].correct_answer).toBe(SECRET_ANSWER)
    expect(questions[0].question_options).toHaveLength(2)
  })
})

test.describe('lesson comments are tenant scoped (#542)', () => {
  test('a member of another tenant reads zero comments', async () => {
    const { data: byLesson, error: byLessonError } = await otherTenantStudent
      .from('lesson_comments')
      .select('id, content')
      .eq('lesson_id', commentLessonId)
    expect(byLessonError).toBeNull()
    expect(byLesson).toEqual([])

    const { data: sweep, error: sweepError } = await otherTenantStudent
      .from('lesson_comments')
      .select('id, content')
      .eq('content', COMMENT_BODY)
    expect(sweepError).toBeNull()
    expect(sweep).toEqual([])
  })

  test('an entitled member of the owning tenant still reads the thread', async () => {
    const { data, error } = await tenantStudent
      .from('lesson_comments')
      .select('id, content')
      .eq('id', commentId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].content).toBe(COMMENT_BODY)
  })
})

test.describe('preview lessons of a draft course stay hidden (#542)', () => {
  test('a signed-in tenant member cannot read a preview lesson whose course is draft', async () => {
    const { data, error } = await tenantStudent
      .from('lessons')
      .select('id, content')
      .eq('id', previewLessonId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('an anonymous visitor cannot read it either', async () => {
    const { data, error } = await getAnon()
      .from('lessons')
      .select('id, content')
      .eq('id', previewLessonId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('publishing the parent course restores the preview for both', async () => {
    const admin = getAdmin()
    const { error: publishError } = await admin
      .from('courses')
      .update({ status: 'published' })
      .eq('course_id', draftCourseId)
    expect(publishError).toBeNull()

    try {
      const { data: signedIn, error: signedInError } = await tenantStudent
        .from('lessons')
        .select('id')
        .eq('id', previewLessonId)
      expect(signedInError).toBeNull()
      expect(signedIn).toHaveLength(1)

      const { data: anon, error: anonError } = await getAnon()
        .from('lessons')
        .select('id')
        .eq('id', previewLessonId)
      expect(anonError).toBeNull()
      expect(anon).toHaveLength(1)
    } finally {
      await admin.from('courses').update({ status: 'draft' }).eq('course_id', draftCourseId)
    }
  })
})
