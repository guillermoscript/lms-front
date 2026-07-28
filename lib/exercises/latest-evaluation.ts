/**
 * Restoring the last graded attempt on a standalone exercise.
 *
 * Every AI engine writes to `exercise_evaluations`, but `ai_result` is free-form
 * jsonb whose shape depends on the writer: the artifact route stores
 * `{feedback, strengths, improvements}`, the chat tool stores `{feedback}` only,
 * and the media route stores a full SpeechEvaluation. This pulls out the parts
 * every engine agrees on so a returning student can re-read how they did.
 *
 * Coding challenges deliberately have no entry here — they are graded by their
 * own test runner and produce an `exercise_completions` row with no feedback, so
 * there is nothing to restore beyond the completion itself.
 */

/** The last graded attempt, normalized across engines. */
export interface LatestExerciseEvaluation {
  id: number
  score: number | null
  passed: boolean
  attemptNumber: number | null
  createdAt: string
  feedback: string | null
  strengths: string[]
  improvements: string[]
}

/** Row shape this module consumes — the columns the exercise page selects. */
export interface ExerciseEvaluationRow {
  id: number | string
  score: number | null
  passed: boolean | null
  ai_result: unknown
  attempt_number?: number | null
  created_at: string
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

export function parseExerciseAiResult(raw: unknown): {
  feedback: string | null
  strengths: string[]
  improvements: string[]
} {
  if (!raw || typeof raw !== 'object') {
    return { feedback: null, strengths: [], improvements: [] }
  }
  const result = raw as Record<string, unknown>
  return {
    feedback: typeof result.feedback === 'string' && result.feedback.trim() !== '' ? result.feedback : null,
    strengths: stringList(result.strengths),
    improvements: stringList(result.improvements),
  }
}

/** Newest row → displayable result. Returns null when there is nothing graded. */
export function toLatestEvaluation(
  row: ExerciseEvaluationRow | null | undefined
): LatestExerciseEvaluation | null {
  if (!row) return null
  const parsed = parseExerciseAiResult(row.ai_result)
  return {
    id: Number(row.id),
    score: row.score === null ? null : Number(row.score),
    passed: row.passed === true,
    attemptNumber: row.attempt_number ?? null,
    createdAt: row.created_at,
    ...parsed,
  }
}
