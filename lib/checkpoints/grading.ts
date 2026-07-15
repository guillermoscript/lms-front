import type {
  CheckpointAnswer,
  CheckpointQuestion,
  DeterministicGradeResult,
  PerQuestionResult,
} from './types'

/** Normalize free-text answers: trim, lowercase, collapse whitespace. */
export function normalizeAnswerText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Grade closed-type checkpoint questions deterministically. Pure — safe to
 * unit test. Unanswered questions count as incorrect.
 */
export function gradeCheckpointQuestions(
  questions: CheckpointQuestion[],
  answers: CheckpointAnswer[]
): DeterministicGradeResult {
  const answerByQuestion = new Map<string, CheckpointAnswer['value']>()
  for (const answer of answers) answerByQuestion.set(answer.questionId, answer.value)

  const perQuestion: PerQuestionResult[] = questions.map((question) => {
    const value = answerByQuestion.get(question.id)
    let correct = false
    let correctValue: PerQuestionResult['correctValue'] = null

    if (question.type === 'multiple_choice') {
      const correctIndex = question.correctIndex ?? -1
      correct = typeof value === 'number' && value === correctIndex
      correctValue = question.options?.[correctIndex] ?? null
    } else if (question.type === 'true_false') {
      correct = typeof value === 'boolean' && value === question.correctAnswer
      correctValue = question.correctAnswer ?? null
    } else if (question.type === 'fill_in_the_blank') {
      const accepted = (question.acceptedAnswers ?? []).map(normalizeAnswerText)
      correct =
        typeof value === 'string' && accepted.includes(normalizeAnswerText(value))
      correctValue = question.acceptedAnswers?.[0] ?? null
    }

    return {
      questionId: question.id,
      correct,
      correctValue,
      explanation: question.explanation,
    }
  })

  const correctCount = perQuestion.filter((r) => r.correct).length
  const total = questions.length
  return {
    score: total === 0 ? 0 : Math.round((correctCount / total) * 100),
    correctCount,
    total,
    perQuestion,
  }
}
