/**
 * Write-side entitlement gates — issue #543 (EPIC #540 §1.3).
 *
 * Four write policies constrained WHO a row belonged to but never whether the
 * writer had earned it. Migration 20260726110000 closes them. These tests drive
 * PostgREST with a real student session — role `authenticated`, exactly what a
 * browser holds — because that is the surface the policies guard; the UI never
 * asks for these rows, so a UI-only test would pass either way.
 *
 *   lesson_completions  a completion for any lesson id was insertable by any
 *                       authenticated user, and /api/certificates/issue counts
 *                       those rows to mint the school's credential
 *   exam_submissions    submitting with no entitlement enqueued AI grading on
 *                       the school's plan budget
 *   practice_attempts   nothing pinned `tenant_id`, so two SECURITY DEFINER
 *                       triggers wrote another school's shared Elo anchors and
 *                       created a gamification profile there
 *
 * The `lesson_checkpoint_attempts` half of #543 lives in checkpoint-access.spec.ts,
 * next to the checkpoint fixtures it needs.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loginAsStudent } from './utils/auth'
import { ACCOUNTS, BASE } from './utils/constants'

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const STUDENT_ID = 'a1000000-0000-0000-0000-000000000001'
const TEACHER_ID = 'a1000000-0000-0000-0000-000000000002'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'

/** Entitled for student@e2etest.com. */
const OWNED_COURSE = 1001
const OWNED_LESSON = 1001
/** Code Academy — student@e2etest.com holds no entitlement for it. */
const FOREIGN_LESSON = 2001

const QA_EXAM_TITLE = '[E2E] 543 Write-Side Exam'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** A user-scoped client — role `authenticated`, exactly what a browser holds. */
async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await client.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()
  return client
}

const asStudent = () => signIn(ACCOUNTS.student.email, ACCOUNTS.student.password)
const asAlice = () => signIn(ACCOUNTS.tenantStudent.email, ACCOUNTS.tenantStudent.password)

/** Run `body` with the student's entitlement to `courseId` revoked, then restore it. */
async function withRevokedEntitlement(
  userId: string,
  courseId: number,
  body: () => Promise<void>
) {
  const admin = getAdmin()
  await admin
    .from('entitlements')
    .update({ status: 'revoked' })
    .eq('user_id', userId)
    .eq('course_id', courseId)
  try {
    await body()
  } finally {
    await admin
      .from('entitlements')
      .update({ status: 'active', revoked_at: null })
      .eq('user_id', userId)
      .eq('course_id', courseId)
  }
}

let qaExamId: number
/** lesson ids the student had completed before this spec ran (restored in afterAll). */
let completionsBefore: number[] = []

test.beforeAll(async () => {
  const admin = getAdmin()

  const { data: existing } = await admin
    .from('lesson_completions')
    .select('lesson_id')
    .eq('user_id', STUDENT_ID)
  completionsBefore = (existing ?? []).map((row) => Number(row.lesson_id))

  // Clean up anything a failed run left behind.
  const { data: staleExams } = await admin
    .from('exams')
    .select('exam_id')
    .eq('title', QA_EXAM_TITLE)
  for (const row of staleExams ?? []) {
    await admin.from('exam_submissions').delete().eq('exam_id', row.exam_id)
  }
  await admin.from('exams').delete().eq('title', QA_EXAM_TITLE)
  await admin.from('practice_attempts').delete().eq('topic', '[E2E] 543 topic')

  const { data: exam, error: examError } = await admin
    .from('exams')
    .insert({
      title: QA_EXAM_TITLE,
      description: 'Issue #543 regression fixture.',
      course_id: OWNED_COURSE,
      duration: 30,
      created_by: TEACHER_ID,
      tenant_id: DEFAULT_TENANT,
      status: 'published',
    })
    .select('exam_id')
    .single()
  expect(examError).toBeNull()
  qaExamId = Number(exam!.exam_id)
})

test.afterAll(async () => {
  const admin = getAdmin()
  // Restore first — a failed assertion must not leave an entitlement revoked
  // for every later spec.
  await admin
    .from('entitlements')
    .update({ status: 'active', revoked_at: null })
    .eq('user_id', STUDENT_ID)
    .eq('course_id', OWNED_COURSE)

  if (qaExamId) {
    await admin.from('exam_submissions').delete().eq('exam_id', qaExamId)
    await admin.from('exams').delete().eq('exam_id', qaExamId)
  }
  await admin.from('practice_attempts').delete().eq('topic', '[E2E] 543 topic')

  // Put the student's progress back exactly as it was — a stray completion
  // would change what later specs (and the student journey) see on the course.
  const { data: now } = await admin
    .from('lesson_completions')
    .select('id, lesson_id')
    .eq('user_id', STUDENT_ID)
  const added = (now ?? []).filter(
    (row) => !completionsBefore.includes(Number(row.lesson_id))
  )
  for (const row of added) {
    await admin.from('lesson_completions').delete().eq('id', row.id)
  }
})

test.describe('lesson_completions INSERT is gated on course access (#543)', () => {
  test('a lesson in a course the student cannot reach is refused', async () => {
    const client = await asStudent()
    const { error } = await client
      .from('lesson_completions')
      .insert({ user_id: STUDENT_ID, lesson_id: FOREIGN_LESSON })

    expect(error, 'RLS must refuse a completion for an unreachable lesson').not.toBeNull()
    expect(error!.code).toBe('42501')

    // And nothing landed.
    const { count } = await getAdmin()
      .from('lesson_completions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', STUDENT_ID)
      .eq('lesson_id', FOREIGN_LESSON)
    expect(count).toBe(0)
  })

  test('a revoked entitlement stops completions on a course still enrolled in', async () => {
    const admin = getAdmin()
    // The enrollment row is left alone on purpose: refunds revoke entitlements,
    // never enrollments, and #532 established that the row grants nothing.
    const { data: enrollment } = await admin
      .from('enrollments')
      .select('enrollment_id')
      .eq('user_id', STUDENT_ID)
      .eq('course_id', OWNED_COURSE)
      .maybeSingle()
    expect(enrollment, 'seed should leave an active enrollment row in place').toBeTruthy()

    await admin
      .from('lesson_completions')
      .delete()
      .eq('user_id', STUDENT_ID)
      .eq('lesson_id', OWNED_LESSON)

    const client = await asStudent()
    await withRevokedEntitlement(STUDENT_ID, OWNED_COURSE, async () => {
      const { error } = await client
        .from('lesson_completions')
        .insert({ user_id: STUDENT_ID, lesson_id: OWNED_LESSON })
      expect(error?.code).toBe('42501')
    })

    // Positive control: the same insert succeeds once access is back, so the
    // policy is refusing on access and not on something incidental.
    const { error: allowed } = await client
      .from('lesson_completions')
      .insert({ user_id: STUDENT_ID, lesson_id: OWNED_LESSON })
    expect(allowed).toBeNull()
  })
})

test.describe('exam_submissions INSERT is gated on course access (#543)', () => {
  test('a student with no entitlement cannot open a submission', async () => {
    const client = await asStudent()
    await withRevokedEntitlement(STUDENT_ID, OWNED_COURSE, async () => {
      const { error } = await client
        .from('exam_submissions')
        .insert({ exam_id: qaExamId, student_id: STUDENT_ID, tenant_id: DEFAULT_TENANT })
      expect(error, 'RLS must refuse an ungated exam submission').not.toBeNull()
      expect(error!.code).toBe('42501')
    })

    const { count } = await getAdmin()
      .from('exam_submissions')
      .select('submission_id', { count: 'exact', head: true })
      .eq('exam_id', qaExamId)
    expect(count).toBe(0)
  })

  test('an entitled student still submits', async () => {
    const client = await asStudent()
    const { data, error } = await client
      .from('exam_submissions')
      .insert({ exam_id: qaExamId, student_id: STUDENT_ID, tenant_id: DEFAULT_TENANT })
      .select('submission_id')
      .single()
    expect(error).toBeNull()
    expect(data?.submission_id).toBeTruthy()
  })
})

test.describe('practice_attempts writes are tenant-bound and bounded (#543)', () => {
  const baseRow = {
    user_id: ALICE_ID,
    topic: '[E2E] 543 topic',
    questions: [],
    answers: [],
    total_questions: 5,
    correct_count: 4,
    score: 80,
  }

  test('a row naming a foreign tenant is refused', async () => {
    const client = await asAlice()
    // Alice belongs to Code Academy only. Naming the Default School tenant used
    // to drive its shared Elo anchors and create a gamification profile there,
    // which is what puts a non-member into that school's league standings.
    const { error } = await client
      .from('practice_attempts')
      .insert({ ...baseRow, tenant_id: DEFAULT_TENANT })
    expect(error, 'RLS must refuse a foreign-tenant practice row').not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await getAdmin()
      .from('practice_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT)
      .eq('topic', baseRow.topic)
    expect(count).toBe(0)
  })

  test('an out-of-range score is refused', async () => {
    const client = await asAlice()
    const { error } = await client
      .from('practice_attempts')
      // 150 rather than something huge: `score` is numeric(5,2), so anything
      // over 999.99 is caught by numeric overflow (22003) and would prove
      // nothing about the constraint.
      .insert({ ...baseRow, tenant_id: CODE_ACADEMY_TENANT, score: 150, correct_count: 5 })
    // 23514 = check_violation
    expect(error?.code).toBe('23514')
  })

  test('graded history is append-only', async () => {
    const admin = getAdmin()
    const { data: seeded, error: seedError } = await admin
      .from('practice_attempts')
      .insert({ ...baseRow, tenant_id: CODE_ACADEMY_TENANT })
      .select('id')
      .single()
    expect(seedError).toBeNull()

    const client = await asAlice()
    const { error: updateError } = await client
      .from('practice_attempts')
      .update({ score: 100 })
      .eq('id', seeded!.id)
    expect(updateError, 'UPDATE grant must be revoked on graded history').not.toBeNull()

    const { error: deleteError } = await client
      .from('practice_attempts')
      .delete()
      .eq('id', seeded!.id)
    expect(deleteError).not.toBeNull()

    const { data: after } = await admin
      .from('practice_attempts')
      .select('score')
      .eq('id', seeded!.id)
      .single()
    expect(Number(after!.score)).toBe(80)
  })

  test('a member still records practice in their own tenant', async () => {
    const client = await asAlice()
    const { data, error } = await client
      .from('practice_attempts')
      .insert({ ...baseRow, tenant_id: CODE_ACADEMY_TENANT })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })
})

test.describe('/api/certificates/issue requires course access (#543)', () => {
  test('completions alone do not mint a credential', async ({ page }) => {
    const admin = getAdmin()

    // The eligibility path this route falls back to is a raw lesson_completions
    // count, so give it every completion it could ask for.
    const { data: lessons } = await admin
      .from('lessons')
      .select('id')
      .eq('course_id', OWNED_COURSE)
    for (const lesson of lessons ?? []) {
      await admin
        .from('lesson_completions')
        .upsert(
          { user_id: STUDENT_ID, lesson_id: lesson.id },
          { onConflict: 'user_id,lesson_id' }
        )
    }
    await admin
      .from('certificates')
      .delete()
      .eq('user_id', STUDENT_ID)
      .eq('course_id', OWNED_COURSE)

    await loginAsStudent(page, BASE)

    await withRevokedEntitlement(STUDENT_ID, OWNED_COURSE, async () => {
      const res = await page.request.post(`${BASE}/api/certificates/issue`, {
        data: { courseId: OWNED_COURSE },
      })
      expect(res.status()).toBe(403)
      const body = await res.json()
      expect(body.accessDenied).toBe(true)
    })

    const { count } = await admin
      .from('certificates')
      .select('certificate_id', { count: 'exact', head: true })
      .eq('user_id', STUDENT_ID)
      .eq('course_id', OWNED_COURSE)
    expect(count, 'no certificate may exist for a caller without access').toBe(0)
  })
})
