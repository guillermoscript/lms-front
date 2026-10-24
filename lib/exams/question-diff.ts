/**
 * How an exam-builder save maps onto the stored questions, worked out before
 * anything is written. Kept questions and options are matched by id and
 * updated in place, so `exam_answers`, `exam_question_scores`,
 * `exam_grading_secrets` (all ON DELETE CASCADE from `exam_questions`) and
 * the grading tests keyed by question id survive an edit. Only what the
 * teacher removed is deleted.
 */

export interface IncomingOption {
  option_id?: number
  option_text: string
  is_correct: boolean
}

export interface IncomingQuestion {
  question_id?: number
  question_type: string
  options: IncomingOption[]
}

export interface StoredQuestion {
  question_id: number
  options: { option_id: number }[]
}

export interface OptionPlan {
  update: (IncomingOption & { option_id: number })[]
  insert: IncomingOption[]
  delete: number[]
}

export interface QuestionPlan<Q extends IncomingQuestion> {
  /** Kept questions, in the order they were sent; `sequence` is 1-based. */
  update: { question_id: number; sequence: number; question: Q; options: OptionPlan }[]
  insert: { sequence: number; question: Q }[]
  delete: number[]
}

export function hasOptions(questionType: string) {
  return questionType === 'multiple_choice' || questionType === 'true_false'
}

function planOptions(questionId: number, stored: { option_id: number }[], incoming: IncomingOption[]): OptionPlan {
  const storedIds = new Set(stored.map((o) => o.option_id))
  const seen = new Set<number>()
  const plan: OptionPlan = { update: [], insert: [], delete: [] }

  for (const option of incoming) {
    if (option.option_id == null) {
      plan.insert.push(option)
      continue
    }
    if (!storedIds.has(option.option_id) || seen.has(option.option_id)) {
      throw new Error(`Option ${option.option_id} does not belong to question ${questionId}`)
    }
    seen.add(option.option_id)
    plan.update.push(option as IncomingOption & { option_id: number })
  }
  plan.delete = [...storedIds].filter((id) => !seen.has(id))
  return plan
}

/**
 * Throws when a question or option id is not one of this exam's, or is sent
 * twice — the action never touches a row of another exam.
 */
export function planExamQuestionDiff<Q extends IncomingQuestion>(
  stored: StoredQuestion[],
  incoming: Q[]
): QuestionPlan<Q> {
  const storedById = new Map(stored.map((q) => [q.question_id, q]))
  const seen = new Set<number>()
  const plan: QuestionPlan<Q> = { update: [], insert: [], delete: [] }

  incoming.forEach((question, idx) => {
    const sequence = idx + 1
    if (question.question_id == null) {
      plan.insert.push({ sequence, question })
      return
    }
    const existing = storedById.get(question.question_id)
    if (!existing || seen.has(question.question_id)) {
      throw new Error(`Question ${question.question_id} does not belong to this exam`)
    }
    seen.add(question.question_id)
    const options = planOptions(
      question.question_id,
      existing.options,
      hasOptions(question.question_type) ? question.options : []
    )
    plan.update.push({ question_id: question.question_id, sequence, question, options })
  })
  plan.delete = stored.map((q) => q.question_id).filter((id) => !seen.has(id))
  return plan
}
