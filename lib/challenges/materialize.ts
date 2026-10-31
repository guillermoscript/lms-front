import type { SupabaseClient } from '@supabase/supabase-js'
import { getEngineType } from '@/lib/exercises/engine'
import { recordExerciseCompletion } from '@/lib/exercises/record-completion'
import { hasCourseAccess } from '@/lib/services/course-access'

/**
 * Mirror a member's OFFICIAL challenge attempt into the normal exercise tables
 * (F1 of the unified challenge model), so it shows in the student's exercise
 * history and counts as a completion (XP) exactly like a normal attempt.
 *
 * Invariants:
 * - Only the official attempt (one per user/exercise, enforced by a unique
 *   index on `challenge_attempts`); practice attempts are never mirrored.
 * - Idempotent: the evaluation row carries `ai_result.challenge_attempt_id` and
 *   is looked up before insert; the completion upsert has a unique key
 *   (`exercise_id,user_id`) with ignoreDuplicates, so the AFTER INSERT XP
 *   trigger fires at most once. A member who already completed the exercise
 *   normally gets no second XP grant.
 * - Requires course access (entitlement), like the normal evaluate route; a
 *   guest who claims into a paid course they did not buy is NOT mirrored.
 * - Text exercises embedded as lesson checkpoints are not mirrored (same rule
 *   as `/api/exercises/evaluate`).
 * - Admin client: both tables are server-write-only. `exercise_completions`
 *   has no tenant_id column; every read here and the evaluation row are
 *   tenant-scoped.
 */

export type MaterializeResult =
  | { status: 'skipped'; reason: 'not_official' | 'exercise_unavailable' | 'no_access' | 'checkpoint_exercise' }
  | { status: 'done'; evaluationCreated: boolean; completionCreated: boolean }

export async function materializeChallengeAttempt(
  admin: SupabaseClient,
  { attemptId, tenantId, userId }: { attemptId: string; tenantId: string; userId: string }
): Promise<MaterializeResult> {
  const { data: attempt } = await admin
    .from('challenge_attempts')
    .select('id, exercise_id, score, passed, answer, feedback, is_official')
    .eq('id', attemptId)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!attempt || attempt.is_official !== true) return { status: 'skipped', reason: 'not_official' }

  const exerciseId = attempt.exercise_id as number
  const { data: exercise } = await admin
    .from('exercises')
    .select('id, course_id, exercise_type, status')
    .eq('id', exerciseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!exercise || exercise.status !== 'published') return { status: 'skipped', reason: 'exercise_unavailable' }

  if (!(await hasCourseAccess(admin, userId, exercise.course_id as number))) {
    return { status: 'skipped', reason: 'no_access' }
  }

  const engineType = getEngineType(exercise.exercise_type as string)
  if (engineType === 'text') {
    const { data: checkpoint } = await admin
      .from('lesson_checkpoints')
      .select('lesson_id')
      .eq('exercise_id', exerciseId)
      .eq('tenant_id', tenantId)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle()
    if (checkpoint) return { status: 'skipped', reason: 'checkpoint_exercise' }
  }

  const { data: existing } = await admin
    .from('exercise_evaluations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exerciseId)
    .eq('user_id', userId)
    .eq('ai_result->>challenge_attempt_id', attemptId)
    .limit(1)
    .maybeSingle()

  let evaluationCreated = false
  if (!existing) {
    const fb = (attempt.feedback && typeof attempt.feedback === 'object' ? attempt.feedback : {}) as {
      feedback?: string
      strengths?: string[]
      improvements?: string[]
    }
    const text = (attempt.answer as { text?: string } | null)?.text ?? ''
    const { error } = await admin.from('exercise_evaluations').insert({
      exercise_id: exerciseId,
      user_id: userId,
      tenant_id: tenantId,
      engine_type: engineType,
      score: attempt.score,
      passed: attempt.passed,
      submission_text: text,
      ai_result: {
        feedback: fb.feedback ?? '',
        strengths: fb.strengths ?? [],
        improvements: fb.improvements ?? [],
        source: 'challenge',
        challenge_attempt_id: attemptId,
      },
    })
    if (error) throw new Error(`challenge_evaluation_mirror_failed: ${error.message}`)
    evaluationCreated = true
  }

  let completionCreated = false
  if (attempt.passed === true) {
    const completion = await recordExerciseCompletion(admin, { exerciseId, userId, score: attempt.score as number })
    if (completion.error) throw new Error(`challenge_completion_mirror_failed: ${completion.error}`)
    completionCreated = completion.created
  }

  return { status: 'done', evaluationCreated, completionCreated }
}
