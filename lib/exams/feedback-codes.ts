/**
 * Exam feedback status codes (#725).
 *
 * The deterministic branches of `gradeExamWithAI` used to write English
 * sentences ("Pending teacher review.", "Correct answer!", ...) into
 * `exam_submissions.ai_data.overall_feedback`, `exam_scores.feedback` and
 * `exam_question_scores.ai_feedback`. Prose in the database cannot follow
 * the reader's locale, so those branches now store one of the codes below
 * and every reader translates it with `examResult.feedback.*`.
 *
 * `parseExamFeedback` also recognises the legacy sentences, so rows graded
 * before this change render translated too. Anything else — the real prose
 * the model wrote — is returned as `null` and shown verbatim.
 *
 * Pure module: no DB, no next-intl, so both server pages and unit tests can
 * import it.
 */

export const EXAM_FEEDBACK_CODES = {
  /** Every question scored; nothing is waiting on a person. */
  graded: 'graded',
  /** Free-text answers parked until a teacher grades them. */
  pendingTeacherReview: 'pending_teacher_review',
  /** Auto-graded multiple choice / true-false: right. */
  correct: 'correct',
  /** Auto-graded multiple choice / true-false: wrong. */
  incorrect: 'incorrect',
} as const

export type ExamFeedbackCode = (typeof EXAM_FEEDBACK_CODES)[keyof typeof EXAM_FEEDBACK_CODES]

export interface ParsedExamFeedback {
  code: ExamFeedbackCode
  /** The correct option text a legacy "Incorrect. The correct answer is: X" row carried. */
  correctAnswer?: string
}

const CODE_SET = new Set<string>(Object.values(EXAM_FEEDBACK_CODES))

/** English sentences written by earlier versions of `gradeExamWithAI`. */
const LEGACY_PROSE: Record<string, ExamFeedbackCode> = {
  'Exam graded successfully.': EXAM_FEEDBACK_CODES.graded,
  'Multiple choice and true/false questions have been auto-graded. Free-text questions are pending teacher review.':
    EXAM_FEEDBACK_CODES.pendingTeacherReview,
  'Pending teacher review.': EXAM_FEEDBACK_CODES.pendingTeacherReview,
  'Correct answer!': EXAM_FEEDBACK_CODES.correct,
  'Correct!': EXAM_FEEDBACK_CODES.correct,
}

// [\s\S] instead of a dotAll `.` — the `s` flag needs es2018+ and this
// repo targets ES2017.
const LEGACY_INCORRECT = /^Incorrect\. The correct answer is: ([\s\S]*)$/

/**
 * Turn a stored feedback value into a status code, or `null` when the value
 * is free prose that should be rendered as-is.
 */
export function parseExamFeedback(value: unknown): ParsedExamFeedback | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  if (CODE_SET.has(text)) return { code: text as ExamFeedbackCode }
  const legacy = LEGACY_PROSE[text]
  if (legacy) return { code: legacy }
  const incorrect = LEGACY_INCORRECT.exec(text)
  if (incorrect) {
    return { code: EXAM_FEEDBACK_CODES.incorrect, correctAnswer: incorrect[1].trim() }
  }
  return null
}

/** Translator shape shared by next-intl's `t` (client) and `getTranslations` (server). */
type FeedbackTranslator = (key: string, values?: Record<string, string | number>) => string

/**
 * Human text for a stored feedback value in the reader's language.
 *
 * `t` must be scoped to `examResult.feedback`. `correctAnswer` is what the
 * caller knows about the question (the option flagged `is_correct`); a
 * legacy row's embedded answer wins when the caller has none. Free prose is
 * returned untouched.
 */
export function describeExamFeedback(
  value: unknown,
  t: FeedbackTranslator,
  options: { correctAnswer?: string | null } = {},
): string {
  const parsed = parseExamFeedback(value)
  if (!parsed) return typeof value === 'string' ? value : ''

  switch (parsed.code) {
    case EXAM_FEEDBACK_CODES.graded:
      return t('graded')
    case EXAM_FEEDBACK_CODES.pendingTeacherReview:
      return t('pendingTeacherReview')
    case EXAM_FEEDBACK_CODES.correct:
      return t('correct')
    case EXAM_FEEDBACK_CODES.incorrect: {
      const answer = parsed.correctAnswer || options.correctAnswer
      return answer ? t('incorrectWithAnswer', { answer }) : t('incorrect')
    }
  }
}
