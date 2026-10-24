import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'

export const checkpointEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  meets_expectations: z.boolean(),
  feedback: z.string(),
  next_step_hint: z.string(),
})

export interface CheckpointGradingExercise {
  title: string
  instructions?: string | null
  /** The exercise's grader prompt, grading secrets already merged back. */
  system_prompt?: string | null
  exercise_config?: unknown
}

export interface GradedCheckpointAnswer {
  /** Rounded and clamped to 0..100. */
  score: number
  meets_expectations: boolean
  feedback: string
  next_step_hint: string
}

export const DEFAULT_CHECKPOINT_PASSING_SCORE = 70

export function checkpointPassingScore(exerciseConfig: unknown): number {
  const config = (exerciseConfig ?? {}) as Record<string, unknown>
  return typeof config.passing_score === 'number' ? config.passing_score : DEFAULT_CHECKPOINT_PASSING_SCORE
}

/**
 * The AI grading of one short checkpoint text answer, shared by the student
 * attempt route and the checkpoint evals so both run the same prompt and
 * schema. `model` is the school's own `checkpoint_grader` model (BYOK; the
 * caller resolves it). Writes nothing and does not catch provider errors.
 */
export async function gradeCheckpointAnswer(
  exercise: CheckpointGradingExercise,
  text: string,
  model: LanguageModel
): Promise<GradedCheckpointAnswer> {
  const config = (exercise.exercise_config ?? {}) as Record<string, unknown>
  const systemPrompt =
    exercise.system_prompt ?? (typeof config.system_prompt === 'string' ? config.system_prompt : null)
  const criteria = typeof config.evaluation_criteria === 'string' ? config.evaluation_criteria : ''

  const { output: object } = await generateText({
    model,
    output: Output.object({ schema: checkpointEvaluationSchema }),
    system: systemPrompt
      ? `${systemPrompt}\n\nYou are evaluating one short student checkpoint answer. Be fair, concise, and formative.`
      : 'You are an expert educational evaluator. Evaluate the student answer fairly and constructively. Be concise and formative.',
    prompt: `## Exercise: ${exercise.title}\n\n## Instructions given to the student:\n${exercise.instructions}\n${criteria ? `\n## Evaluation criteria:\n${criteria}\n` : ''}\n## Student answer:\n${text}\n\nScore 0-100. "feedback" is 2-4 sentences of explanatory feedback; "next_step_hint" is one actionable next step. Respond in the language of the student's answer.`,
    experimental_telemetry: { functionId: 'checkpoint-evaluator' },
  })
  if (!object) throw new Error('Grader returned no output')
  return {
    score: Math.max(0, Math.min(100, Math.round(object.score))),
    meets_expectations: object.meets_expectations,
    feedback: object.feedback,
    next_step_hint: object.next_step_hint,
  }
}
