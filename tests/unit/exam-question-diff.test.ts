/**
 * The exam builder save keeps question and option ids: kept rows are updated
 * in place, new ones inserted, only removed ones deleted — so the answers,
 * scores, grading secrets and grading tests keyed by question id survive.
 */
import { describe, expect, it } from 'vitest'
import { planExamQuestionDiff, type IncomingQuestion } from '@/lib/exams/question-diff'

const stored = [
  { question_id: 10, options: [{ option_id: 100 }, { option_id: 101 }] },
  { question_id: 11, options: [] },
  { question_id: 12, options: [{ option_id: 120 }, { option_id: 121 }] },
]

function mc(question_id: number | undefined, options: IncomingQuestion['options']): IncomingQuestion {
  return { question_id, question_type: 'multiple_choice', options }
}
const freeText = (question_id?: number): IncomingQuestion => ({ question_id, question_type: 'free_text', options: [] })

describe('planExamQuestionDiff', () => {
  it('a text-only edit updates every question in place and deletes nothing', () => {
    const plan = planExamQuestionDiff(stored, [
      mc(10, [{ option_id: 100, option_text: 'a', is_correct: true }, { option_id: 101, option_text: 'b', is_correct: false }]),
      freeText(11),
      mc(12, [{ option_id: 120, option_text: 'c', is_correct: false }, { option_id: 121, option_text: 'd', is_correct: true }]),
    ])

    expect(plan.delete).toEqual([])
    expect(plan.insert).toEqual([])
    expect(plan.update.map((u) => u.question_id)).toEqual([10, 11, 12])
    for (const u of plan.update) {
      expect(u.options.delete).toEqual([])
      expect(u.options.insert).toEqual([])
    }
    expect(plan.update[0].options.update.map((o) => o.option_id)).toEqual([100, 101])
  })

  it('inserts new questions, deletes only the removed one and numbers them in sent order', () => {
    const plan = planExamQuestionDiff(stored, [
      freeText(),
      mc(12, [{ option_id: 120, option_text: 'c', is_correct: true }, { option_id: 121, option_text: 'd', is_correct: false }]),
      freeText(11),
    ])

    expect(plan.delete).toEqual([10])
    expect(plan.insert).toEqual([{ sequence: 1, question: expect.objectContaining({ question_type: 'free_text' }) }])
    expect(plan.update.map((u) => [u.question_id, u.sequence])).toEqual([[12, 2], [11, 3]])
  })

  it('diffs options: keeps by id, inserts new ones, deletes dropped ones', () => {
    const plan = planExamQuestionDiff(stored, [
      mc(10, [{ option_id: 101, option_text: 'b', is_correct: true }, { option_text: 'new', is_correct: false }]),
      freeText(11),
      mc(12, [{ option_id: 120, option_text: 'c', is_correct: true }, { option_id: 121, option_text: 'd', is_correct: false }]),
    ])

    const q10 = plan.update[0].options
    expect(q10.update.map((o) => o.option_id)).toEqual([101])
    expect(q10.insert).toEqual([{ option_text: 'new', is_correct: false }])
    expect(q10.delete).toEqual([100])
  })

  it('a question switched to free text drops its options', () => {
    const plan = planExamQuestionDiff(stored, [
      { question_id: 10, question_type: 'free_text', options: [{ option_id: 100, option_text: 'a', is_correct: true }] },
      freeText(11),
      freeText(12),
    ])
    expect(plan.update[0].options).toEqual({ update: [], insert: [], delete: [100, 101] })
    expect(plan.update[2].options.delete).toEqual([120, 121])
  })

  it('refuses a question id from another exam', () => {
    expect(() => planExamQuestionDiff(stored, [freeText(999)])).toThrow(/does not belong to this exam/)
  })

  it('refuses a question id sent twice', () => {
    expect(() => planExamQuestionDiff(stored, [freeText(11), freeText(11)])).toThrow(/does not belong/)
  })

  it('refuses an option id from another question', () => {
    expect(() =>
      planExamQuestionDiff(stored, [
        mc(10, [{ option_id: 120, option_text: 'x', is_correct: true }, { option_id: 101, option_text: 'b', is_correct: false }]),
      ])
    ).toThrow(/Option 120 does not belong to question 10/)
  })

  it('removing every question deletes them all', () => {
    expect(planExamQuestionDiff(stored, []).delete).toEqual([10, 11, 12])
  })
})
