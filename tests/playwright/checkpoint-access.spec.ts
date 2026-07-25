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
import { BASE } from './utils/constants'

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
