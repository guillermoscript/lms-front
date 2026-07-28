/**
 * Shared contracts for lesson checkpoints (issue #392).
 *
 * A checkpoint links an existing exercise to a lesson placement — an inline
 * content-block anchor or a video timestamp. Exercises remain the source of
 * truth for question content; deterministic closed-type questions live in
 * exercise_config.questions and are graded server-side only (correct answers
 * never ship to the client before an attempt).
 */

export type CheckpointPlacement = 'inline' | 'video'

export type CheckpointEvaluatorType =
  | 'deterministic'
  | 'ai'
  | 'media'
  | 'code'
  | 'pending'
  | 'fallback'

/** Closed-type question stored in exercise_config.questions. */
export interface CheckpointQuestion {
  id: string
  type: 'multiple_choice' | 'true_false' | 'fill_in_the_blank'
  prompt: string
  /** multiple_choice only */
  options?: string[]
  /** multiple_choice only — index into options */
  correctIndex?: number
  /** true_false only */
  correctAnswer?: boolean
  /** fill_in_the_blank only — any normalized match counts */
  acceptedAnswers?: string[]
  explanation?: string
}

/** Question projection safe to send to the student before answering. */
export interface ClientCheckpointQuestion {
  id: string
  type: CheckpointQuestion['type']
  prompt: string
  options?: string[]
}

export interface CheckpointAnswer {
  questionId: string
  value: string | number | boolean
}

export interface PerQuestionResult {
  questionId: string
  correct: boolean
  /** Shown after grading for immediate explanatory feedback. */
  correctValue: string | number | boolean | null
  explanation?: string
}

export interface DeterministicGradeResult {
  score: number
  correctCount: number
  total: number
  perQuestion: PerQuestionResult[]
}

/** Row shape of lesson_checkpoints as consumed by the app. */
export interface LessonCheckpointRow {
  id: number
  tenant_id: string
  lesson_id: number
  exercise_id: number
  placement_type: CheckpointPlacement
  content_block_id: string | null
  video_timestamp_seconds: number | null
  label: string | null
  allow_skip: boolean
  max_ai_attempts: number
  is_required: boolean
  is_enabled: boolean
}

/** Normalized result every checkpoint adapter resolves to. */
export interface CheckpointAttemptResult {
  attemptId: number
  attemptNumber: number
  evaluatorType: CheckpointEvaluatorType
  completed: boolean
  passed: boolean | null
  score: number | null
  feedback?: string
  nextStepHint?: string
  perQuestion?: PerQuestionResult[]
  /** True when AI evaluation was unavailable (quota/plan/provider). */
  aiUnavailable?: boolean
  canRetryAi?: boolean
}

/** What the student submitted, restored from lesson_checkpoint_attempts.response. */
export interface SubmittedCheckpointResponse {
  /** Free-text answer (essay/discussion checkpoints). */
  text?: string
  /** Closed-question answers keyed by question id. */
  answers?: Record<string, string | number | boolean>
}

/** Client-visible slice of lesson_checkpoint_attempts.evaluation. */
export interface StoredCheckpointEvaluation {
  feedback?: string
  nextStepHint?: string
  perQuestion?: PerQuestionResult[]
  aiUnavailable?: boolean
}

/**
 * Restore the student's own answer from the stored `response` jsonb. The attempt
 * route writes one of three shapes — `{ text }`, `{ answers }`, or `{ source }`
 * for external syncs — and this is free-form jsonb, so anything unrecognised
 * yields "nothing to show" rather than being trusted into the UI.
 */
export function parseStoredResponse(raw: unknown): SubmittedCheckpointResponse {
  if (!raw || typeof raw !== 'object') return {}
  const row = raw as Record<string, unknown>
  if (typeof row.text === 'string') return { text: row.text }
  if (!Array.isArray(row.answers)) return {}
  const answers: Record<string, string | number | boolean> = {}
  for (const item of row.answers) {
    if (!item || typeof item !== 'object') continue
    const answer = item as Record<string, unknown>
    if (typeof answer.questionId !== 'string') continue
    const value = answer.value
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      answers[answer.questionId] = value
    }
  }
  return Object.keys(answers).length > 0 ? { answers } : {}
}

/**
 * Restore the graded feedback from the stored `evaluation` jsonb — the AI shape
 * (`feedback` / `next_step_hint`), the deterministic shape (`per_question`), or
 * the fallback shape (`fallback_reason`, meaning the answer was recorded but no
 * AI feedback exists). External-sync attempts carry only ids and yield nothing.
 */
export function parseStoredEvaluation(raw: unknown): StoredCheckpointEvaluation {
  if (!raw || typeof raw !== 'object') return {}
  const row = raw as Record<string, unknown>
  const parsed: StoredCheckpointEvaluation = {}
  if (typeof row.feedback === 'string') parsed.feedback = row.feedback
  if (typeof row.next_step_hint === 'string') parsed.nextStepHint = row.next_step_hint
  if (typeof row.fallback_reason === 'string') parsed.aiUnavailable = true
  if (Array.isArray(row.per_question)) {
    const perQuestion: PerQuestionResult[] = []
    for (const item of row.per_question) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (typeof entry.questionId !== 'string' || typeof entry.correct !== 'boolean') continue
      const correctValue = entry.correctValue
      perQuestion.push({
        questionId: entry.questionId,
        correct: entry.correct,
        correctValue:
          typeof correctValue === 'string' ||
          typeof correctValue === 'number' ||
          typeof correctValue === 'boolean'
            ? correctValue
            : null,
        explanation: typeof entry.explanation === 'string' ? entry.explanation : undefined,
      })
    }
    if (perQuestion.length > 0) parsed.perQuestion = perQuestion
  }
  return parsed
}

/**
 * Should a checkpoint card open on its own when the lesson loads?
 *
 * Only for a graded attempt the student did NOT pass: that is the one state
 * holding something to act on (the AI's feedback and next-step hint), and
 * collapsing it meant a returning student saw a score chip and nothing else.
 * A passed attempt stays collapsed — it is a receipt, not a task — and an
 * ungraded one (`passed === null`, e.g. an external sync) has nothing to show.
 */
export function shouldAutoExpandCheckpoint(
  attempt: { completed: boolean; passed: boolean | null } | null | undefined
): boolean {
  return attempt?.completed === true && attempt.passed === false
}

/** Client-safe view of the linked exercise for rendering a checkpoint. */
export interface ClientCheckpointExercise {
  id: number
  title: string
  description: string | null
  instructions: string
  exercise_type: string
  questions: ClientCheckpointQuestion[] | null
  passingScore: number
}

export const CLOSED_EXERCISE_TYPES = [
  'quiz',
  'multiple_choice',
  'true_false',
  'fill_in_the_blank',
] as const

export const TEXT_AI_EXERCISE_TYPES = ['essay', 'discussion'] as const

/** Exercise types whose evaluation happens in their existing dedicated flow. */
export const EXTERNAL_EXERCISE_TYPES = [
  'coding_challenge',
  'audio_evaluation',
  'video_evaluation',
  'artifact',
  'real_time_conversation',
] as const

export function evaluatorTypeForExternal(
  exerciseType: string
): Extract<CheckpointEvaluatorType, 'code' | 'media' | 'ai'> {
  if (exerciseType === 'coding_challenge') return 'code'
  if (exerciseType === 'audio_evaluation' || exerciseType === 'video_evaluation')
    return 'media'
  return 'ai'
}

export function toClientCheckpointQuestions(
  questions: CheckpointQuestion[] | null | undefined
): ClientCheckpointQuestion[] | null {
  if (!questions || questions.length === 0) return null
  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    ...(q.type === 'multiple_choice' ? { options: q.options ?? [] } : {}),
  }))
}

/** Parse exercise_config.questions defensively — teacher-authored JSON. */
export function parseCheckpointQuestions(
  config: Record<string, unknown> | null | undefined
): CheckpointQuestion[] | null {
  const raw = (config as { questions?: unknown } | null)?.questions
  if (!Array.isArray(raw) || raw.length === 0) return null
  const questions: CheckpointQuestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const q = item as Record<string, unknown>
    if (typeof q.id !== 'string' || typeof q.prompt !== 'string') continue
    if (q.type === 'multiple_choice') {
      if (!Array.isArray(q.options) || typeof q.correctIndex !== 'number') continue
      questions.push({
        id: q.id,
        type: 'multiple_choice',
        prompt: q.prompt,
        options: q.options.filter((o): o is string => typeof o === 'string'),
        correctIndex: q.correctIndex,
        explanation: typeof q.explanation === 'string' ? q.explanation : undefined,
      })
    } else if (q.type === 'true_false') {
      if (typeof q.correctAnswer !== 'boolean') continue
      questions.push({
        id: q.id,
        type: 'true_false',
        prompt: q.prompt,
        correctAnswer: q.correctAnswer,
        explanation: typeof q.explanation === 'string' ? q.explanation : undefined,
      })
    } else if (q.type === 'fill_in_the_blank') {
      if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length === 0) continue
      questions.push({
        id: q.id,
        type: 'fill_in_the_blank',
        prompt: q.prompt,
        acceptedAnswers: q.acceptedAnswers.filter(
          (a): a is string => typeof a === 'string'
        ),
        explanation: typeof q.explanation === 'string' ? q.explanation : undefined,
      })
    }
  }
  return questions.length > 0 ? questions : null
}
