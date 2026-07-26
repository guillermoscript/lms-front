/**
 * Lesson-checkpoint attempt route — access enforcement (issue #532)
 *
 * The route reads through the service-role client, so #509's RLS backstop
 * cannot cover it, and it used to gate on an `enrollments` row — a progress
 * record that nothing revokes and that any tenant member can insert for
 * themselves. These tests pin the three states the gate must distinguish:
 *
 *   entitled            → 200, attempt recorded
 *   entitlement revoked → 403 accessDenied     (the refund case, #498/#515)
 *   tenant past cutoff  → 403 accessSuspended  (the downgrade case, #494)
 *
 * Deliberately uses a deterministic (closed-question) checkpoint so a passing
 * attempt needs no AI provider.
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { loginAsStudent } from './utils/auth'
import { ACCOUNTS, BASE } from './utils/constants'

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const STUDENT_ID = 'a1000000-0000-0000-0000-000000000001'
const TEACHER_ID = 'a1000000-0000-0000-0000-000000000002'
const COURSE_ID = 1001
const LESSON_ID = 1001

const EXERCISE_TITLE = '[E2E] Checkpoint Access Exercise'
const CONTENT_BLOCK_ID = 'e2e-532-checkpoint'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

let exerciseId: number
let checkpointId: number

const ANSWERS = [{ questionId: 'q1', value: 1 }]

test.beforeAll(async () => {
  const admin = getAdmin()

  // Clean up anything a failed run left behind.
  const { data: stale } = await admin
    .from('exercises')
    .select('id')
    .eq('title', EXERCISE_TITLE)
  for (const row of stale ?? []) {
    await admin.from('lesson_checkpoint_attempts').delete().eq('exercise_id', row.id)
    await admin.from('lesson_checkpoints').delete().eq('exercise_id', row.id)
  }
  await admin.from('exercises').delete().eq('title', EXERCISE_TITLE)

  const { data: exercise, error: exerciseError } = await admin
    .from('exercises')
    .insert({
      title: EXERCISE_TITLE,
      instructions: 'Pick the right answer.',
      exercise_type: 'multiple_choice',
      difficulty_level: 'easy',
      course_id: COURSE_ID,
      created_by: TEACHER_ID,
      tenant_id: DEFAULT_TENANT,
      status: 'published',
      exercise_config: {
        passing_score: 50,
        questions: [
          {
            id: 'q1',
            type: 'multiple_choice',
            prompt: 'Which one is a testing framework?',
            options: ['Hammer', 'Vitest', 'Bicycle'],
            correctIndex: 1,
          },
        ],
      },
    })
    .select('id')
    .single()
  if (exerciseError || !exercise) {
    throw new Error(`Seed exercise failed: ${exerciseError?.message}`)
  }
  exerciseId = Number(exercise.id)

  const { data: checkpoint, error: checkpointError } = await admin
    .from('lesson_checkpoints')
    .insert({
      tenant_id: DEFAULT_TENANT,
      lesson_id: LESSON_ID,
      exercise_id: exerciseId,
      placement_type: 'inline',
      content_block_id: CONTENT_BLOCK_ID,
      created_by: TEACHER_ID,
    })
    .select('id')
    .single()
  if (checkpointError || !checkpoint) {
    throw new Error(`Seed checkpoint failed: ${checkpointError?.message}`)
  }
  checkpointId = Number(checkpoint.id)
})

test.afterAll(async () => {
  const admin = getAdmin()
  // Restore state first — a failed assertion must not leave the tenant cut off
  // or the student's entitlement revoked for every later spec.
  await admin.from('tenants').update({ access_cutoff_at: null }).eq('id', DEFAULT_TENANT)
  await admin
    .from('entitlements')
    .update({ status: 'active', revoked_at: null })
    .eq('user_id', STUDENT_ID)
    .eq('course_id', COURSE_ID)

  if (checkpointId) {
    await admin.from('lesson_checkpoint_attempts').delete().eq('checkpoint_id', checkpointId)
    await admin.from('lesson_checkpoints').delete().eq('id', checkpointId)
  }
  if (exerciseId) await admin.from('exercises').delete().eq('id', exerciseId)
})

test.describe('checkpoint attempt access gate (#532)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page, BASE)
  })

  test('entitled student can submit an attempt', async ({ page }) => {
    const res = await page.request.post(
      `${BASE}/api/lesson-checkpoints/${checkpointId}/attempt`,
      { data: { kind: 'answers', answers: ANSWERS } }
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.evaluatorType).toBe('deterministic')
    expect(body.passed).toBe(true)
  })

  test('revoked entitlement is refused even with the enrollment row intact', async ({
    page,
  }) => {
    const admin = getAdmin()
    // The enrollment row is deliberately left alone: it is what the route used
    // to trust, and the whole point of #532 is that it no longer counts.
    const { data: enrollment } = await admin
      .from('enrollments')
      .select('enrollment_id')
      .eq('user_id', STUDENT_ID)
      .eq('course_id', COURSE_ID)
      .maybeSingle()
    expect(enrollment, 'seed should leave an active enrollment row in place').toBeTruthy()

    await admin
      .from('entitlements')
      .update({ status: 'revoked' })
      .eq('user_id', STUDENT_ID)
      .eq('course_id', COURSE_ID)
    try {
      const res = await page.request.post(
        `${BASE}/api/lesson-checkpoints/${checkpointId}/attempt`,
        { data: { kind: 'answers', answers: ANSWERS } }
      )
      expect(res.status()).toBe(403)
      const body = await res.json()
      expect(body.accessDenied).toBe(true)
      expect(body.accessSuspended).toBe(false)
    } finally {
      await admin
        .from('entitlements')
        .update({ status: 'active', revoked_at: null })
        .eq('user_id', STUDENT_ID)
        .eq('course_id', COURSE_ID)
    }
  })

  test('tenant past its access cutoff is refused as suspended', async ({ page }) => {
    const admin = getAdmin()
    await admin
      .from('tenants')
      .update({ access_cutoff_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', DEFAULT_TENANT)
    try {
      const res = await page.request.post(
        `${BASE}/api/lesson-checkpoints/${checkpointId}/attempt`,
        { data: { kind: 'answers', answers: ANSWERS } }
      )
      expect(res.status()).toBe(403)
      const body = await res.json()
      expect(body.accessSuspended).toBe(true)
    } finally {
      await admin.from('tenants').update({ access_cutoff_at: null }).eq('id', DEFAULT_TENANT)
    }
  })
})

/**
 * #543 — the gate above decides WHETHER an attempt may be recorded; these
 * decide WHO gets to fill it in. Every column on `lesson_checkpoint_attempts`
 * except the identity ones is a grading output, and the route's own comment
 * used to claim "DB policies are the last word" while no policy mentioned
 * `score`, `passed`, `completed` or `evaluator_type`. The table is now
 * server-write-only (20260726110000).
 */
test.describe('checkpoint attempts are server-written (#543)', () => {
  test('a student cannot write an attempt directly', async () => {
    const client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error: signInError } = await client.auth.signInWithPassword({
      email: ACCOUNTS.student.email,
      password: ACCOUNTS.student.password,
    })
    expect(signInError).toBeNull()

    // A self-declared pass on a required checkpoint: this is what unlocked
    // lesson progression, and what billed the tenant's AI allowance when
    // tagged evaluator_type 'ai'.
    const { error } = await client.from('lesson_checkpoint_attempts').insert({
      tenant_id: DEFAULT_TENANT,
      user_id: STUDENT_ID,
      course_id: COURSE_ID,
      lesson_id: LESSON_ID,
      checkpoint_id: checkpointId,
      exercise_id: exerciseId,
      attempt_number: 999,
      placement_source: 'inline',
      response: {},
      evaluation: {},
      score: 100,
      passed: true,
      completed: true,
      evaluator_type: 'ai',
    })
    expect(error, 'the INSERT grant must be revoked for authenticated').not.toBeNull()
    expect(error!.code).toBe('42501')

    const { count } = await getAdmin()
      .from('lesson_checkpoint_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('checkpoint_id', checkpointId)
      .eq('attempt_number', 999)
    expect(count).toBe(0)
  })

  test('the stored score and passed flag are the grader\'s, not the caller\'s', async ({
    page,
  }) => {
    await loginAsStudent(page, BASE)
    const res = await page.request.post(
      `${BASE}/api/lesson-checkpoints/${checkpointId}/attempt`,
      // 'Hammer' — deliberately wrong (correctIndex is 1).
      { data: { kind: 'answers', answers: [{ questionId: 'q1', value: 0 }] } }
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.passed).toBe(false)

    const { data: row } = await getAdmin()
      .from('lesson_checkpoint_attempts')
      .select('score, passed, evaluator_type')
      .eq('checkpoint_id', checkpointId)
      .eq('user_id', STUDENT_ID)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .single()
    expect(row!.passed).toBe(false)
    expect(Number(row!.score)).toBe(Number(body.score))
    expect(row!.evaluator_type).toBe('deterministic')
  })

  test('a refunded student reads no checkpoints at all', async () => {
    const admin = getAdmin()
    const client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error: signInError } = await client.auth.signInWithPassword({
      email: ACCOUNTS.student.email,
      password: ACCOUNTS.student.password,
    })
    expect(signInError).toBeNull()

    // Sanity: with access, the checkpoint is visible.
    const { data: visible } = await client
      .from('lesson_checkpoints')
      .select('id')
      .eq('id', checkpointId)
    expect(visible?.length).toBe(1)

    // The SELECT policy used to join `enrollments`, which a refund never
    // touches — so the refunded student kept reading every enabled checkpoint.
    await admin
      .from('entitlements')
      .update({ status: 'revoked' })
      .eq('user_id', STUDENT_ID)
      .eq('course_id', COURSE_ID)
    try {
      const { data: hidden } = await client
        .from('lesson_checkpoints')
        .select('id')
        .eq('id', checkpointId)
      expect(hidden?.length).toBe(0)
    } finally {
      await admin
        .from('entitlements')
        .update({ status: 'active', revoked_at: null })
        .eq('user_id', STUDENT_ID)
        .eq('course_id', COURSE_ID)
    }
  })
})
