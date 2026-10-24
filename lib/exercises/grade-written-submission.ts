import type { LanguageModel } from 'ai'
import { evaluateWrittenExercise, type WrittenGradingExercise } from '@/lib/exercises/evaluate-written'
import { evaluateArtifactExercise } from '@/lib/exercises/evaluate-artifact'
import { DEFAULT_PASSING_SCORE } from '@/lib/ai/config'

export interface GradedSubmission {
  /** Rounded and clamped to 0..100. */
  score: number
  passed: boolean
  passingScore: number
  evaluation: { score: number; feedback: string; strengths: string[]; improvements: string[] }
}

/**
 * The AI grading of one written/code/artifact submission, shared by the
 * exercise preview and the graded-answer evals so both run the same path.
 * `model` is the school's own grader (`getModelForFeature('exercise_grader')`).
 * Writes nothing.
 */
export async function gradeWrittenSubmission(
  exercise: WrittenGradingExercise,
  content: string,
  model: LanguageModel,
  metadata?: Record<string, unknown>
): Promise<GradedSubmission> {
  let evaluation: GradedSubmission['evaluation']
  let passingScore: number
  if (exercise.exercise_type === 'artifact') {
    const config = (exercise.exercise_config ?? {}) as { passing_score?: unknown }
    passingScore =
      typeof config.passing_score === 'number' ? Math.min(100, Math.max(0, config.passing_score)) : DEFAULT_PASSING_SCORE
    evaluation = await evaluateArtifactExercise(exercise, content, model, metadata)
  } else {
    const result = await evaluateWrittenExercise(exercise, content, model)
    evaluation = result.evaluation
    passingScore = result.passingScore
  }
  const score = Math.min(100, Math.max(0, Math.round(evaluation.score)))
  return { score, passed: score >= passingScore, passingScore, evaluation }
}
