import { describe, expect, it } from 'vitest'
import {
  EXAM_FEEDBACK_CODES,
  describeExamFeedback,
  parseExamFeedback,
} from '@/lib/exams/feedback-codes'

/**
 * #725 moved exam feedback from English prose in the database to status codes
 * the reader's locale translates. Rows graded before that change still hold the
 * old sentences, so the parser has to recognise both — the acceptance criterion
 * "existing `exam_scores.ai_data` rows with the old English prose still render
 * something sensible".
 */
describe('parseExamFeedback', () => {
  it('recognises the codes it writes today', () => {
    for (const code of Object.values(EXAM_FEEDBACK_CODES)) {
      expect(parseExamFeedback(code)).toEqual({ code })
    }
  })

  it('maps the legacy English sentences onto codes', () => {
    expect(parseExamFeedback('Pending teacher review.')).toEqual({
      code: EXAM_FEEDBACK_CODES.pendingTeacherReview,
    })
    expect(
      parseExamFeedback(
        'Multiple choice and true/false questions have been auto-graded. Free-text questions are pending teacher review.'
      )
    ).toEqual({ code: EXAM_FEEDBACK_CODES.pendingTeacherReview })
    expect(parseExamFeedback('Exam graded successfully.')).toEqual({
      code: EXAM_FEEDBACK_CODES.graded,
    })
    expect(parseExamFeedback('Correct answer!')).toEqual({ code: EXAM_FEEDBACK_CODES.correct })
  })

  it('pulls the answer out of a legacy "incorrect" sentence, including a multi-line one', () => {
    expect(parseExamFeedback('Incorrect. The correct answer is: Bogotá')).toEqual({
      code: EXAM_FEEDBACK_CODES.incorrect,
      correctAnswer: 'Bogotá',
    })
    expect(parseExamFeedback('Incorrect. The correct answer is: line one\nline two')).toEqual({
      code: EXAM_FEEDBACK_CODES.incorrect,
      correctAnswer: 'line one\nline two',
    })
  })

  it('returns null for real model prose and for non-strings', () => {
    expect(parseExamFeedback('Your argument about supply curves was well structured.')).toBeNull()
    expect(parseExamFeedback('')).toBeNull()
    expect(parseExamFeedback('   ')).toBeNull()
    expect(parseExamFeedback(null)).toBeNull()
    expect(parseExamFeedback(42)).toBeNull()
  })
})

describe('describeExamFeedback', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key

  it('translates a code', () => {
    expect(describeExamFeedback(EXAM_FEEDBACK_CODES.graded, t)).toBe('graded')
    expect(describeExamFeedback(EXAM_FEEDBACK_CODES.pendingTeacherReview, t)).toBe(
      'pendingTeacherReview'
    )
  })

  it('prefers the answer embedded in a legacy row over the caller-supplied one', () => {
    expect(
      describeExamFeedback('Incorrect. The correct answer is: Bogotá', t, {
        correctAnswer: 'Lima',
      })
    ).toBe('incorrectWithAnswer:{"answer":"Bogotá"}')
  })

  it('falls back to the caller-supplied answer, then to the plain message', () => {
    expect(
      describeExamFeedback(EXAM_FEEDBACK_CODES.incorrect, t, { correctAnswer: 'Lima' })
    ).toBe('incorrectWithAnswer:{"answer":"Lima"}')
    expect(describeExamFeedback(EXAM_FEEDBACK_CODES.incorrect, t)).toBe('incorrect')
  })

  it('returns real prose untouched and empty for non-strings', () => {
    const prose = 'Tu razonamiento sobre la curva de oferta fue claro.'
    expect(describeExamFeedback(prose, t)).toBe(prose)
    expect(describeExamFeedback(null, t)).toBe('')
  })
})
