import { describe, it, expect } from 'vitest'

import {
  parseExerciseAiResult,
  toLatestEvaluation,
} from '../../lib/exercises/latest-evaluation'

/**
 * Pins the restore path for standalone exercises (artifact / essay).
 *
 * `exercise_evaluations.ai_result` is free-form jsonb and each engine writes a
 * different shape: the artifact route writes {feedback, strengths, improvements},
 * the chat tool writes {feedback} alone, the media route writes a full
 * SpeechEvaluation. Contract:
 *   - Take the fields every engine agrees on; ignore the rest.
 *   - Never throw on a shape that has not been seen before.
 *   - Blank strings and non-string list entries are dropped, so the UI never
 *     renders an empty bullet or an empty "AI feedback" heading.
 */

describe('parseExerciseAiResult', () => {
  it('reads the full artifact shape', () => {
    expect(
      parseExerciseAiResult({
        feedback: 'Solid state handling.',
        strengths: ['Clear naming', 'Good edge cases'],
        improvements: ['Extract the reducer'],
      })
    ).toEqual({
      feedback: 'Solid state handling.',
      strengths: ['Clear naming', 'Good edge cases'],
      improvements: ['Extract the reducer'],
    })
  })

  it('reads the chat-tool shape, which has feedback only', () => {
    expect(parseExerciseAiResult({ feedback: 'Well argued.' })).toEqual({
      feedback: 'Well argued.',
      strengths: [],
      improvements: [],
    })
  })

  it('treats a blank or missing feedback string as no feedback', () => {
    // An empty string would otherwise render an "AI Feedback" heading over nothing.
    expect(parseExerciseAiResult({ feedback: '   ' }).feedback).toBeNull()
    expect(parseExerciseAiResult({ feedback: 42 }).feedback).toBeNull()
    expect(parseExerciseAiResult({}).feedback).toBeNull()
  })

  it('drops non-string and blank list entries', () => {
    expect(
      parseExerciseAiResult({
        strengths: ['Real', '', '   ', 7, null, { a: 1 }],
        improvements: 'not a list',
      })
    ).toEqual({ feedback: null, strengths: ['Real'], improvements: [] })
  })

  it('tolerates null, primitives and unknown engine shapes', () => {
    const empty = { feedback: null, strengths: [], improvements: [] }
    expect(parseExerciseAiResult(null)).toEqual(empty)
    expect(parseExerciseAiResult(undefined)).toEqual(empty)
    expect(parseExerciseAiResult('feedback')).toEqual(empty)
    // A SpeechEvaluation from the media engine carries none of these keys.
    expect(parseExerciseAiResult({ transcript: 'hi', wpm: 120 })).toEqual(empty)
  })
})

describe('toLatestEvaluation', () => {
  const row = {
    id: '12',
    score: 82,
    passed: true,
    ai_result: { feedback: 'Nice work.', strengths: ['Clear'], improvements: [] },
    attempt_number: 2,
    created_at: '2026-07-27T10:00:00.000Z',
  }

  it('normalizes a graded row', () => {
    expect(toLatestEvaluation(row)).toEqual({
      id: 12,
      score: 82,
      passed: true,
      attemptNumber: 2,
      createdAt: '2026-07-27T10:00:00.000Z',
      feedback: 'Nice work.',
      strengths: ['Clear'],
      improvements: [],
    })
  })

  it('returns null when there is no graded attempt', () => {
    expect(toLatestEvaluation(null)).toBeNull()
    expect(toLatestEvaluation(undefined)).toBeNull()
  })

  it('treats a null `passed` as not passed rather than as truthy', () => {
    expect(toLatestEvaluation({ ...row, passed: null })?.passed).toBe(false)
  })

  it('keeps a null score null instead of coercing it to zero', () => {
    // Number(null) is 0 — that would report an ungraded attempt as a hard zero.
    expect(toLatestEvaluation({ ...row, score: null })?.score).toBeNull()
  })

  it('tolerates a missing attempt_number', () => {
    const withoutAttempt = { ...row }
    delete (withoutAttempt as Partial<typeof row>).attempt_number
    expect(toLatestEvaluation(withoutAttempt)?.attemptNumber).toBeNull()
  })
})
