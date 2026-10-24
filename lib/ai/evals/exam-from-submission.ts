import { DEFAULT_EXAM_TOLERANCE, examAnswersSchema, type ExamAnswers, type ExamExpected } from './schema'
import type { ExamQuestionMeta } from './store'

export interface SubmissionAnswerRow {
  question_id: number
  answer_text: string | null
}

/** The teacher's final grade for one question (exam_question_scores). */
export interface SubmissionScoreRow {
  question_id: number
  points_earned: number | null
  is_correct?: boolean | null
}

/** What the AI grader stored per question (exam_submissions.ai_data.question_feedback). */
export type AiQuestionFeedback = Record<string, { points_earned?: number | null } | undefined>

export type SubmissionCaseError = 'no_answers' | 'answers_too_large' | 'no_ai_questions'

/**
 * Turn a teacher-reviewed exam submission into a graded_exam case: the student's
 * answers become the input, and the teacher's final points on each written
 * question become the expectation. Nothing about the student is carried over.
 *
 * A written question the teacher left untouched keeps the AI's points, since the
 * teacher signed the review off with that grade in place. Only points are
 * judged (see below).
 */
export function buildExamCaseFromSubmission(input: {
  questions: ExamQuestionMeta[]
  answers: SubmissionAnswerRow[]
  scores: SubmissionScoreRow[]
  aiFeedback: AiQuestionFeedback | null
}): { ok: true; answers: ExamAnswers; expected: ExamExpected } | { ok: false; error: SubmissionCaseError } {
  const known = new Set(input.questions.map((q) => q.question_id))
  const answers: Record<string, string> = {}
  for (const a of input.answers) {
    const text = a.answer_text ?? ''
    if (!known.has(a.question_id) || text === '') continue
    answers[String(a.question_id)] = text
  }
  if (Object.keys(answers).length === 0) return { ok: false, error: 'no_answers' }
  const parsed = examAnswersSchema.safeParse(answers)
  if (!parsed.success) return { ok: false, error: 'answers_too_large' }

  const scoreById = new Map(input.scores.map((s) => [s.question_id, s]))
  const questions: ExamExpected['questions'] = {}
  for (const q of input.questions) {
    if (q.question_type !== 'free_text' || !(String(q.question_id) in answers)) continue
    const teacher = scoreById.get(q.question_id)
    const ai = input.aiFeedback?.[String(q.question_id)]
    const points = teacher?.points_earned ?? ai?.points_earned
    if (typeof points !== 'number' || !Number.isFinite(points)) continue
    // Points only: the review screen lets a teacher change the points without
    // touching correct/incorrect, so a stored is_correct can contradict them.
    questions[String(q.question_id)] = { points_earned: Math.max(0, Math.min(q.points, points)), tolerance: DEFAULT_EXAM_TOLERANCE }
  }
  if (Object.keys(questions).length === 0) return { ok: false, error: 'no_ai_questions' }

  return { ok: true, answers: parsed.data, expected: { questions, total_tolerance: DEFAULT_EXAM_TOLERANCE, category: 'custom' } }
}
