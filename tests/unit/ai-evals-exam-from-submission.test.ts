/**
 * F5: a teacher-reviewed exam submission becomes a graded_exam case. The
 * teacher's final points are the expectation (points only, never is_correct); closed questions only carry the
 * answer; nothing about the student is kept.
 */
import { describe, expect, it } from 'vitest'
import { buildExamCaseFromSubmission } from '@/lib/ai/evals/exam-from-submission'

const questions = [
  { question_id: 1, question_type: 'multiple_choice', points: 10, option_ids: [11, 12] },
  { question_id: 2, question_type: 'free_text', points: 10, option_ids: [] },
  { question_id: 3, question_type: 'free_text', points: 5, option_ids: [] },
  { question_id: 4, question_type: 'true_false', points: 10, option_ids: [] },
]

describe('buildExamCaseFromSubmission', () => {
  it("expects the teacher's points, falling back to the AI's on untouched written questions", () => {
    const out = buildExamCaseFromSubmission({
      questions,
      answers: [
        { question_id: 1, answer_text: '12' },
        { question_id: 2, answer_text: 'Lists are mutable.' },
        { question_id: 3, answer_text: 'Because of the GIL.' },
        { question_id: 4, answer_text: 'true' },
      ],
      scores: [
        { question_id: 1, points_earned: 0, is_correct: false },
        { question_id: 2, points_earned: 4, is_correct: false },
      ],
      aiFeedback: { '2': { points_earned: 9 }, '3': { points_earned: 5 } },
    })
    expect(out).toEqual({
      ok: true,
      answers: { '1': '12', '2': 'Lists are mutable.', '3': 'Because of the GIL.', '4': 'true' },
      expected: {
        questions: {
          '2': { points_earned: 4, tolerance: 10 },
          '3': { points_earned: 5, tolerance: 10 },
        },
        total_tolerance: 10,
        category: 'custom',
      },
    })
  })

  it('clamps points to the question and skips blank or unknown answers', () => {
    const out = buildExamCaseFromSubmission({
      questions,
      answers: [
        { question_id: 2, answer_text: 'x' },
        { question_id: 3, answer_text: '' },
        { question_id: 99, answer_text: 'stray' },
      ],
      scores: [{ question_id: 2, points_earned: 12, is_correct: null }],
      aiFeedback: null,
    })
    expect(out.ok && out.answers).toEqual({ '2': 'x' })
    expect(out.ok && out.expected.questions).toEqual({ '2': { points_earned: 10, tolerance: 10 } })
  })

  it('refuses a submission with no graded written answer', () => {
    expect(
      buildExamCaseFromSubmission({ questions, answers: [{ question_id: 1, answer_text: '11' }], scores: [], aiFeedback: null })
    ).toEqual({ ok: false, error: 'no_ai_questions' })
    expect(buildExamCaseFromSubmission({ questions, answers: [], scores: [], aiFeedback: null })).toEqual({
      ok: false,
      error: 'no_answers',
    })
  })
})
