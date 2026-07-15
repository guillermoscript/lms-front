import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseCheckpointQuestions,
  toClientCheckpointQuestions,
  type CheckpointEvaluatorType,
  type CheckpointPlacement,
  type ClientCheckpointExercise,
} from './types'

export interface CheckpointAttemptSummary {
  attemptNumber: number
  completed: boolean
  passed: boolean | null
  score: number | null
  evaluatorType: CheckpointEvaluatorType
}

/** Everything the student lesson needs to render one checkpoint. Client-safe:
 * correct answers, system prompts, and evaluation criteria are stripped here. */
export interface LessonCheckpointClientData {
  id: number
  placementType: CheckpointPlacement
  contentBlockId: string | null
  videoTimestampSeconds: number | null
  label: string | null
  allowSkip: boolean
  maxAiAttempts: number
  isRequired: boolean
  exercise: ClientCheckpointExercise
  latestAttempt: CheckpointAttemptSummary | null
  attemptCount: number
}

/**
 * Load enabled checkpoints for a lesson with the student's latest attempts.
 * Runs server-side (admin client) — output is safe to pass to client components.
 */
export async function loadLessonCheckpoints(
  adminClient: SupabaseClient,
  args: { tenantId: string; lessonId: number; userId: string }
): Promise<LessonCheckpointClientData[]> {
  const { data: checkpoints } = await adminClient
    .from('lesson_checkpoints')
    .select(
      'id, placement_type, content_block_id, video_timestamp_seconds, label, allow_skip, max_ai_attempts, is_required, exercises(id, title, description, instructions, exercise_type, exercise_config, tenant_id)'
    )
    .eq('lesson_id', args.lessonId)
    .eq('tenant_id', args.tenantId)
    .eq('is_enabled', true)
    .order('id', { ascending: true })

  if (!checkpoints || checkpoints.length === 0) return []

  const { data: attempts } = await adminClient
    .from('lesson_checkpoint_attempts')
    .select('checkpoint_id, attempt_number, completed, passed, score, evaluator_type')
    .eq('user_id', args.userId)
    .eq('lesson_id', args.lessonId)
    .order('attempt_number', { ascending: false })

  const latestByCheckpoint = new Map<number, CheckpointAttemptSummary>()
  const countByCheckpoint = new Map<number, number>()
  for (const attempt of attempts ?? []) {
    countByCheckpoint.set(
      attempt.checkpoint_id,
      (countByCheckpoint.get(attempt.checkpoint_id) ?? 0) + 1
    )
    if (!latestByCheckpoint.has(attempt.checkpoint_id)) {
      latestByCheckpoint.set(attempt.checkpoint_id, {
        attemptNumber: attempt.attempt_number,
        completed: attempt.completed,
        passed: attempt.passed,
        score: attempt.score === null ? null : Number(attempt.score),
        evaluatorType: attempt.evaluator_type as CheckpointEvaluatorType,
      })
    }
  }

  const result: LessonCheckpointClientData[] = []
  for (const row of checkpoints) {
    const exercise = row.exercises as unknown as {
      id: number
      title: string
      description: string | null
      instructions: string
      exercise_type: string
      exercise_config: Record<string, unknown> | null
      tenant_id: string
    } | null
    if (!exercise || exercise.tenant_id !== args.tenantId) continue
    const config = exercise.exercise_config ?? {}
    result.push({
      id: row.id,
      placementType: row.placement_type,
      contentBlockId: row.content_block_id,
      videoTimestampSeconds: row.video_timestamp_seconds,
      label: row.label,
      allowSkip: row.allow_skip,
      maxAiAttempts: row.max_ai_attempts,
      isRequired: row.is_required,
      exercise: {
        id: exercise.id,
        title: exercise.title,
        description: exercise.description,
        instructions: exercise.instructions,
        exercise_type: exercise.exercise_type,
        questions: toClientCheckpointQuestions(parseCheckpointQuestions(config)),
        passingScore:
          typeof config.passing_score === 'number' ? config.passing_score : 70,
      },
      latestAttempt: latestByCheckpoint.get(row.id) ?? null,
      attemptCount: countByCheckpoint.get(row.id) ?? 0,
    })
  }
  return result
}
