import { describe, it, expect } from 'vitest'

import {
  gradeCheckpointQuestions,
  normalizeAnswerText,
} from '../../lib/checkpoints/grading'
import { mergeGradingSecrets, withGradingSecrets } from '../../lib/exercises/grading-secrets'
import {
  parseCheckpointQuestions,
  toClientCheckpointQuestions,
  type CheckpointQuestion,
} from '../../lib/checkpoints/types'

/**
 * Pins the deterministic checkpoint grader and the exercise_config.questions
 * parser (issue #392). Contract:
 *   - Grading is server-side; unanswered questions count as incorrect.
 *   - fill_in_the_blank matches case/whitespace-insensitively.
 *   - The client projection NEVER contains correct answers or explanations.
 *   - Malformed teacher-authored JSON is dropped, never thrown on.
 */

const questions: CheckpointQuestion[] = [
  {
    id: 'q1',
    type: 'multiple_choice',
    prompt: 'Pick B',
    options: ['A', 'B', 'C'],
    correctIndex: 1,
    explanation: 'B is correct',
  },
  { id: 'q2', type: 'true_false', prompt: 'Sky is blue', correctAnswer: true },
  {
    id: 'q3',
    type: 'fill_in_the_blank',
    prompt: 'Capital of France',
    acceptedAnswers: ['Paris', 'paris city'],
  },
]

describe('gradeCheckpointQuestions', () => {
  it('grades a fully correct submission at 100', () => {
    const result = gradeCheckpointQuestions(questions, [
      { questionId: 'q1', value: 1 },
      { questionId: 'q2', value: true },
      { questionId: 'q3', value: '  PARIS ' },
    ])
    expect(result.score).toBe(100)
    expect(result.correctCount).toBe(3)
    expect(result.perQuestion.every((r) => r.correct)).toBe(true)
  })

  it('counts unanswered and wrong answers as incorrect, rounds the score', () => {
    const result = gradeCheckpointQuestions(questions, [
      { questionId: 'q1', value: 0 },
      { questionId: 'q3', value: 'London' },
    ])
    expect(result.correctCount).toBe(0)
    expect(result.score).toBe(0)

    const oneRight = gradeCheckpointQuestions(questions, [
      { questionId: 'q2', value: true },
    ])
    expect(oneRight.score).toBe(33) // 1/3 rounded
  })

  it('rejects type-confused values (string "1" is not option index 1)', () => {
    const result = gradeCheckpointQuestions(questions, [
      { questionId: 'q1', value: '1' },
      { questionId: 'q2', value: 'true' },
    ])
    expect(result.correctCount).toBe(0)
  })

  it('returns correctValue and explanation for post-answer feedback', () => {
    const result = gradeCheckpointQuestions(questions, [
      { questionId: 'q1', value: 2 },
    ])
    const q1 = result.perQuestion.find((r) => r.questionId === 'q1')!
    expect(q1.correctValue).toBe('B')
    expect(q1.explanation).toBe('B is correct')
    const q2 = result.perQuestion.find((r) => r.questionId === 'q2')!
    expect(q2.correctValue).toBe(true)
    const q3 = result.perQuestion.find((r) => r.questionId === 'q3')!
    expect(q3.correctValue).toBe('Paris')
  })

  it('scores an empty question list as 0 without dividing by zero', () => {
    const result = gradeCheckpointQuestions([], [])
    expect(result.score).toBe(0)
    expect(result.total).toBe(0)
  })
})

describe('normalizeAnswerText', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeAnswerText('  Foo   BAR  ')).toBe('foo bar')
  })
})

describe('parseCheckpointQuestions', () => {
  it('parses valid questions and drops malformed entries', () => {
    const parsed = parseCheckpointQuestions({
      questions: [
        ...questions,
        { id: 'bad1', type: 'multiple_choice', prompt: 'no options' },
        { id: 'bad2', type: 'true_false', prompt: 'no answer' },
        { id: 'bad3', type: 'fill_in_the_blank', prompt: 'no accepted', acceptedAnswers: [] },
        'not-an-object',
        { type: 'multiple_choice', prompt: 'missing id', options: ['x'], correctIndex: 0 },
      ],
    })
    expect(parsed?.map((q) => q.id)).toEqual(['q1', 'q2', 'q3'])
  })

  it('returns null for missing, empty, or non-array questions', () => {
    expect(parseCheckpointQuestions(null)).toBeNull()
    expect(parseCheckpointQuestions({})).toBeNull()
    expect(parseCheckpointQuestions({ questions: [] })).toBeNull()
    expect(parseCheckpointQuestions({ questions: 'nope' })).toBeNull()
    expect(parseCheckpointQuestions({ questions: [{ junk: true }] })).toBeNull()
  })
})

describe('toClientCheckpointQuestions', () => {
  it('never leaks correct answers, accepted answers, or explanations', () => {
    const client = toClientCheckpointQuestions(questions)!
    const serialized = JSON.stringify(client)
    expect(serialized).not.toContain('correctIndex')
    expect(serialized).not.toContain('correctAnswer')
    expect(serialized).not.toContain('acceptedAnswers')
    expect(serialized).not.toContain('explanation')
    expect(client[0].options).toEqual(['A', 'B', 'C'])
    expect(client[1].options).toBeUndefined()
  })

  it('returns null for empty input', () => {
    expect(toClientCheckpointQuestions(null)).toBeNull()
    expect(toClientCheckpointQuestions([])).toBeNull()
  })
})

describe('mergeGradingSecrets', () => {
  // exercise_config as students can SELECT it since #829: answers stripped.
  const stripped = {
    passing_score: 80,
    questions: [
      { id: 'q1', type: 'multiple_choice', prompt: 'Pick B', options: ['A', 'B', 'C'] },
      { id: 'q2', type: 'true_false', prompt: 'Sky is blue' },
      { id: 'q3', type: 'fill_in_the_blank', prompt: 'Capital of France' },
      { type: 'true_false', prompt: 'no id' },
    ],
  }
  const keyRow = {
    questions: {
      q1: { correctIndex: 1, explanation: 'B is right' },
      q2: { correctAnswer: true },
      q3: { acceptedAnswers: ['Paris'] },
    },
  }

  it('restores a gradable question set from the stripped config and the key row', () => {
    const merged = mergeGradingSecrets(stripped, keyRow)
    expect(merged.passing_score).toBe(80)
    const parsed = parseCheckpointQuestions(merged)!
    expect(parsed.map((q) => q.id)).toEqual(['q1', 'q2', 'q3'])
    expect(parsed[0].correctIndex).toBe(1)
    expect(parsed[0].explanation).toBe('B is right')
    const grade = gradeCheckpointQuestions(parsed, [
      { questionId: 'q1', value: 1 },
      { questionId: 'q2', value: true },
      { questionId: 'q3', value: ' paris ' },
    ])
    expect(grade.score).toBe(100)
  })

  it('accepts the embed as an array (to-many shape) too', () => {
    expect(parseCheckpointQuestions(mergeGradingSecrets(stripped, [keyRow]))).toHaveLength(3)
  })

  it('without a key the stripped questions stay ungradable, so nothing parses', () => {
    expect(mergeGradingSecrets(stripped, null)).toBe(stripped)
    expect(parseCheckpointQuestions(mergeGradingSecrets(stripped, null))).toBeNull()
    expect(parseCheckpointQuestions(mergeGradingSecrets(stripped, { questions: 'junk' }))).toBeNull()
  })

  it('leaves configs without a questions array alone', () => {
    const essay = { evaluation_criteria: 'x' }
    expect(mergeGradingSecrets(essay, keyRow)).toBe(essay)
    expect(mergeGradingSecrets(null, keyRow)).toEqual({})
  })

  it('round-trips to a client projection that still carries no answers', () => {
    const client = toClientCheckpointQuestions(
      parseCheckpointQuestions(mergeGradingSecrets(stripped, keyRow))
    )
    const serialized = JSON.stringify(client)
    expect(serialized).not.toContain('correctIndex')
    expect(serialized).not.toContain('acceptedAnswers')
    expect(serialized).not.toContain('explanation')
  })
})

describe('grading secrets (#833)', () => {
  // The row as a student can SELECT it: no prompt, no criteria.
  const stored = {
    id: 7,
    system_prompt: null,
    template_variables: null,
    exercise_config: { passing_score: 70 },
  }
  const secrets = {
    questions: {},
    config: { evaluation_criteria: 'Mentions photosynthesis', expected_keywords: ['light'] },
    system_prompt: 'Model answer: plants make sugar from light.',
    template_variables: { topic: 'plants' },
  }

  it('puts the secret config keys back next to the public ones', () => {
    expect(mergeGradingSecrets(stored.exercise_config, secrets)).toEqual({
      passing_score: 70,
      evaluation_criteria: 'Mentions photosynthesis',
      expected_keywords: ['light'],
    })
  })

  it('restores the prompt and template variables and drops the embed', () => {
    const merged = withGradingSecrets({ ...stored, exercise_grading_secrets: secrets })
    expect(merged.system_prompt).toBe(secrets.system_prompt)
    expect(merged.template_variables).toEqual({ topic: 'plants' })
    expect(merged.exercise_config).toMatchObject({ evaluation_criteria: 'Mentions photosynthesis' })
    expect('exercise_grading_secrets' in merged).toBe(false)
  })

  it('leaves the row as stored when there are no secrets', () => {
    const merged = withGradingSecrets({ ...stored, exercise_grading_secrets: null })
    expect(merged.system_prompt).toBeNull()
    expect(merged.exercise_config).toEqual({ passing_score: 70 })
  })
})
