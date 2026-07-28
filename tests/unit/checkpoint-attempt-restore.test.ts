import { describe, it, expect } from 'vitest'

import {
  parseStoredEvaluation,
  parseStoredResponse,
  shouldAutoExpandCheckpoint,
} from '../../lib/checkpoints/types'

/**
 * Pins the restore path that lets a student re-read a finished lesson task.
 *
 * The AI feedback was always written to lesson_checkpoint_attempts.evaluation,
 * but the loader never selected the column, so returning to a completed
 * checkpoint showed a bare score badge and nothing else. These parsers are what
 * turn those two free-form jsonb columns back into displayable feedback.
 *
 * Contract:
 *   - The four shapes the attempt route writes (deterministic / ai / fallback /
 *     external sync) each restore exactly what they carry, and nothing more.
 *   - jsonb is free-form: anything unrecognised yields "nothing to show"
 *     rather than being trusted into the UI. Never throws.
 */

describe('parseStoredEvaluation', () => {
  it('restores AI feedback and the next-step hint', () => {
    expect(
      parseStoredEvaluation({
        feedback: 'Good grasp of the base case.',
        next_step_hint: 'Try tracing the call stack.',
        meets_expectations: true,
      })
    ).toEqual({
      feedback: 'Good grasp of the base case.',
      nextStepHint: 'Try tracing the call stack.',
    })
  })

  it('restores deterministic per-question results', () => {
    const parsed = parseStoredEvaluation({
      correct_count: 1,
      total: 2,
      per_question: [
        { questionId: 'q1', correct: true, correctValue: 1, explanation: 'B is correct' },
        { questionId: 'q2', correct: false, correctValue: null },
      ],
    })
    expect(parsed.perQuestion).toEqual([
      { questionId: 'q1', correct: true, correctValue: 1, explanation: 'B is correct' },
      { questionId: 'q2', correct: false, correctValue: null, explanation: undefined },
    ])
    expect(parsed.feedback).toBeUndefined()
  })

  it('flags a fallback attempt as AI-unavailable', () => {
    // The answer was recorded but never graded — the student must be told that,
    // not shown an unexplained empty result.
    expect(parseStoredEvaluation({ fallback_reason: 'provider_error' })).toEqual({
      aiUnavailable: true,
    })
  })

  it('yields nothing for an external-sync attempt', () => {
    expect(
      parseStoredEvaluation({ synced_evaluation_id: 7, synced_completion_id: null })
    ).toEqual({})
  })

  it('drops malformed per-question entries instead of throwing', () => {
    const parsed = parseStoredEvaluation({
      per_question: [
        { questionId: 'q1', correct: true, correctValue: 'a' },
        { questionId: 42, correct: true },
        { correct: true },
        { questionId: 'q4', correct: 'yes' },
        null,
        'nope',
      ],
    })
    expect(parsed.perQuestion).toEqual([
      { questionId: 'q1', correct: true, correctValue: 'a', explanation: undefined },
    ])
  })

  it('omits perQuestion entirely when every entry is malformed', () => {
    expect(parseStoredEvaluation({ per_question: [{ bogus: true }] })).toEqual({})
  })

  it('tolerates null, primitives and wrong types', () => {
    expect(parseStoredEvaluation(null)).toEqual({})
    expect(parseStoredEvaluation(undefined)).toEqual({})
    expect(parseStoredEvaluation('feedback')).toEqual({})
    expect(parseStoredEvaluation({ feedback: 12, next_step_hint: [] })).toEqual({})
  })
})

describe('parseStoredResponse', () => {
  it('restores a free-text answer', () => {
    expect(parseStoredResponse({ text: 'Recursion is when a function calls itself.' })).toEqual({
      text: 'Recursion is when a function calls itself.',
    })
  })

  it('restores closed answers keyed by question id', () => {
    expect(
      parseStoredResponse({
        answers: [
          { questionId: 'q1', value: 1 },
          { questionId: 'q2', value: true },
          { questionId: 'q3', value: 'photosynthesis' },
        ],
      })
    ).toEqual({ answers: { q1: 1, q2: true, q3: 'photosynthesis' } })
  })

  it('preserves a falsy answer rather than dropping it', () => {
    // `false` and `0` are real answers to true/false and multiple-choice
    // questions — a truthiness check here would blank the first option.
    expect(
      parseStoredResponse({
        answers: [
          { questionId: 'q1', value: false },
          { questionId: 'q2', value: 0 },
          { questionId: 'q3', value: '' },
        ],
      })
    ).toEqual({ answers: { q1: false, q2: 0, q3: '' } })
  })

  it('yields nothing for an external-sync response', () => {
    expect(parseStoredResponse({ source: 'exercise_evaluations' })).toEqual({})
  })

  it('drops malformed answer entries instead of throwing', () => {
    expect(
      parseStoredResponse({
        answers: [
          { questionId: 'q1', value: 1 },
          { questionId: 'q2', value: { nested: true } },
          { value: 3 },
          null,
        ],
      })
    ).toEqual({ answers: { q1: 1 } })
  })

  it('tolerates null, primitives and wrong types', () => {
    expect(parseStoredResponse(null)).toEqual({})
    expect(parseStoredResponse(undefined)).toEqual({})
    expect(parseStoredResponse('text')).toEqual({})
    expect(parseStoredResponse({ text: 99 })).toEqual({})
    expect(parseStoredResponse({ answers: 'q1' })).toEqual({})
    expect(parseStoredResponse({ answers: [] })).toEqual({})
  })
})

describe('shouldAutoExpandCheckpoint', () => {
  /**
   * Restoring the feedback is worthless if it stays behind a closed chevron.
   * The card opens itself only for the state that asks something of the
   * student; everything else stays collapsed so a long lesson does not unfurl.
   */
  it('opens a graded attempt the student did not pass', () => {
    expect(shouldAutoExpandCheckpoint({ completed: true, passed: false })).toBe(true)
  })

  it('leaves a passed attempt collapsed — it is a receipt, not a task', () => {
    expect(shouldAutoExpandCheckpoint({ completed: true, passed: true })).toBe(false)
  })

  it('leaves an ungraded attempt collapsed', () => {
    // `passed` is null for external syncs, which carry no feedback to read.
    expect(shouldAutoExpandCheckpoint({ completed: true, passed: null })).toBe(false)
  })

  it('leaves an unattempted or incomplete checkpoint collapsed', () => {
    expect(shouldAutoExpandCheckpoint({ completed: false, passed: false })).toBe(false)
    expect(shouldAutoExpandCheckpoint(null)).toBe(false)
    expect(shouldAutoExpandCheckpoint(undefined)).toBe(false)
  })
})
