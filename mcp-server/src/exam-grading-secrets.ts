/**
 * An exam's answer key never sits on `exam_questions` / `question_options`,
 * which anyone who can read the exam may SELECT (#840). The
 * `trg_split_exam_*` triggers lift it into the staff-only
 * `exam_grading_secrets`, one row per question:
 *
 * - `correct_answer`, `grading_rubric`, `ai_grading_criteria`,
 *   `expected_keywords` — the `exam_questions` columns of the same name
 * - `correct_option_ids` — replaces `question_options.is_correct`
 *
 * Staff readers (RLS) and the grader (admin client) embed
 * {@link EXAM_GRADING_SECRETS_EMBED} on `exam_questions` and merge it back with
 * {@link withExamGradingSecrets}. A student gets the right answer only after
 * grading, from the `get_exam_answer_key` RPC ({@link withExamAnswerKey}).
 *
 * Mirrors lib/exams/grading-secrets.ts in the app; this package cannot
 * import from the app.
 */
export const EXAM_GRADING_SECRETS_EMBED =
  'exam_grading_secrets(correct_answer, grading_rubric, ai_grading_criteria, expected_keywords, correct_option_ids)'

interface ExamGradingSecretsRow {
  correct_answer: string | null
  grading_rubric: string | null
  ai_grading_criteria: string | null
  expected_keywords: string[] | null
  correct_option_ids: number[] | null
}

/** A row of `get_exam_answer_key(p_submission_id)`. */
export interface ExamAnswerKeyRow {
  question_id: number
  correct_answer: string | null
  correct_option_ids: number[] | null
}

type OptionLike = { option_id: number; is_correct?: boolean | null }

type QuestionLike = {
  question_id: number
  options?: OptionLike[] | null
  question_options?: OptionLike[] | null
}

/** The embed as PostgREST returns it: an object for the one-to-one relation, tolerated as an array or null. */
function secretsRow(embed: unknown): ExamGradingSecretsRow | null {
  const row = Array.isArray(embed) ? embed[0] : embed
  return row && typeof row === 'object' ? (row as ExamGradingSecretsRow) : null
}

function flagOptions<O extends OptionLike>(options: O[] | null | undefined, correctIds: number[]) {
  if (!options) return options
  return options.map((o) => ({ ...o, is_correct: correctIds.includes(o.option_id) }))
}

function withOptionFlags<Q extends QuestionLike>(question: Q, correctIds: number[]): Q {
  const merged = { ...question }
  if (question.options) merged.options = flagOptions(question.options, correctIds)
  if (question.question_options) merged.question_options = flagOptions(question.question_options, correctIds)
  return merged
}

/**
 * The question as it was written: key columns restored and every option's
 * `is_correct` set (under `options` or `question_options`, whichever the
 * select aliased). The `exam_grading_secrets` embed is dropped from the result.
 */
export function withExamGradingSecrets<Q extends QuestionLike & { exam_grading_secrets?: unknown }>(
  question: Q
): Omit<Q, 'exam_grading_secrets'> & Omit<ExamGradingSecretsRow, 'correct_option_ids'> {
  const { exam_grading_secrets: embed, ...rest } = question
  const row = secretsRow(embed)
  return {
    ...withOptionFlags(rest as unknown as Q, row?.correct_option_ids ?? []),
    correct_answer: row?.correct_answer ?? null,
    grading_rubric: row?.grading_rubric ?? null,
    ai_grading_criteria: row?.ai_grading_criteria ?? null,
    expected_keywords: row?.expected_keywords ?? null,
  }
}

/**
 * A student's graded view: `correct_answer` and option flags from the
 * `get_exam_answer_key` rows. No rows (not graded yet) leaves every question
 * without a key — `correct_answer: null`, options `is_correct: false`.
 */
export function withExamAnswerKey<Q extends QuestionLike>(
  questions: Q[],
  keyRows: ExamAnswerKeyRow[] | null | undefined
): Array<Q & { correct_answer: string | null }> {
  const byQuestion = new Map((keyRows ?? []).map((r) => [r.question_id, r]))
  return questions.map((q) => {
    const key = byQuestion.get(q.question_id)
    return {
      ...withOptionFlags(q, key?.correct_option_ids ?? []),
      correct_answer: key?.correct_answer ?? null,
    }
  })
}
