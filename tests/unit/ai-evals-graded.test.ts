/**
 * Graded-answer evals (F2): median/stddev/deviation, the injection and
 * pass-flip rules, tolerance boundary, and the sample drafter, on mock models.
 */
import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import {
  computeGradedDeviation,
  draftSampleAnswers,
  judgeGradedRepeats,
  median,
  runGradedCase,
  stddev,
} from '@/lib/ai/evals/graded-answer-engine'
import { GRADED_EVAL_EXERCISE_TYPES, gradedExpectedSchema, gradedInputSchema, type GradedCaseRow } from '@/lib/ai/evals/schema'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
}
const textResult = (text: string) => ({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })

/** Grader returning the given scores, one per call (last repeats). */
function graderModel(scores: number[]) {
  let i = 0
  return new MockLanguageModelV4({
    doGenerate: (async () => {
      const score = scores[Math.min(i++, scores.length - 1)]
      return textResult(JSON.stringify({ score, feedback: 'ok', strengths: ['a'], improvements: ['b'] }))
    }) as never,
  })
}

const exercise = { title: 'Essay', instructions: 'Explain X', exercise_type: 'essay', exercise_config: { passing_score: 70 } }

function testCase(expected: Partial<GradedCaseRow['expected']> & { score: number }): GradedCaseRow {
  return {
    id: 'c1', kind: 'graded_answer', source: 'teacher', name: 'n', importance_note: null,
    expected: gradedExpectedSchema.parse(expected),
    input: { content: 'an answer' }, golden_output: null, generated_for_version_id: null, teacher_edited: false,
  }
}

describe('helpers', () => {
  it('median', () => {
    expect(median([80, 60, 70])).toBe(70)
    expect(median([60, 80])).toBe(70)
    expect(median([])).toBe(0)
  })
  it('stddev is population', () => {
    expect(stddev([70, 70, 70])).toBe(0)
    expect(stddev([60, 70, 80])).toBe(8.16)
  })
  it('deviation rounds and clamps', () => {
    expect(computeGradedDeviation(72.5, 70)).toBe(3)
    expect(computeGradedDeviation(100, 0)).toBe(100)
  })
  it('exports the graded types', () => {
    expect(GRADED_EVAL_EXERCISE_TYPES).toEqual(['essay', 'discussion', 'coding_challenge', 'artifact'])
  })
})

describe('gradedInputSchema', () => {
  it('caps serialized metadata at 10k chars', () => {
    expect(gradedInputSchema.safeParse({ content: 'x', metadata: { a: 'y'.repeat(100) } }).success).toBe(true)
    expect(gradedInputSchema.safeParse({ content: 'x', metadata: { a: 'y'.repeat(10_000) } }).success).toBe(false)
  })
})

describe('judgeGradedRepeats', () => {
  const base = { passingScore: 70 }
  it('passes exactly at tolerance and fails one past it', () => {
    const at = judgeGradedRepeats({ ...base, scores: [80, 80, 80], passedFlags: [true, true, true], expected: gradedExpectedSchema.parse({ score: 70, tolerance: 10 }) })
    expect(at.deviation).toBe(10)
    expect(at.ok).toBe(true)
    const past = judgeGradedRepeats({ ...base, scores: [81, 81, 81], passedFlags: [true, true, true], expected: gradedExpectedSchema.parse({ score: 70, tolerance: 10 }) })
    expect(past.reasons).toContain('out_of_tolerance')
    expect(past.ok).toBe(false)
  })
  it('flags a repeat that disagrees as unstable, and a majority that disagrees as a pass flip', () => {
    const one = judgeGradedRepeats({ ...base, scores: [72, 68, 72], passedFlags: [true, false, true], expected: gradedExpectedSchema.parse({ score: 72, tolerance: 10 }) })
    expect(one.pass_flip).toBe(false)
    expect(one.unstable).toBe(true)
    expect(one.ok).toBe(true)
    const maj = judgeGradedRepeats({ ...base, scores: [68, 68, 72], passedFlags: [false, false, true], expected: gradedExpectedSchema.parse({ score: 72, tolerance: 10 }) })
    expect(maj.reasons).toContain('pass_flip')
    expect(maj.ok).toBe(false)
  })
  it('honours an explicit expected.passed over the score', () => {
    const r = judgeGradedRepeats({ ...base, scores: [60, 60, 60], passedFlags: [false, false, false], expected: gradedExpectedSchema.parse({ score: 60, passed: false }) })
    expect(r.ok).toBe(true)
  })
  it('injection: any repeat above expected fails hard even within tolerance', () => {
    const r = judgeGradedRepeats({ ...base, scores: [10, 10, 15], passedFlags: [false, false, false], expected: gradedExpectedSchema.parse({ score: 10, tolerance: 20, category: 'injection' }) })
    expect(r.inflated).toBe(true)
    expect(r.ok).toBe(false)
    const fine = judgeGradedRepeats({ ...base, scores: [10, 5, 8], passedFlags: [false, false, false], expected: gradedExpectedSchema.parse({ score: 10, tolerance: 20, category: 'injection' }) })
    expect(fine.ok).toBe(true)
  })
})

describe('runGradedCase', () => {
  it('grades three times and reports median, stddev and the median repeat output', async () => {
    let calls = 0
    const out = await runGradedCase({ grader: graderModel([60, 70, 80]), exercise, onModelCall: () => { calls++ } }, testCase({ score: 70 }))
    expect(calls).toBe(3)
    expect(out.scores).toEqual([60, 70, 80])
    expect(out.score).toBe(70)
    expect(out.score_stddev).toBe(8.16)
    expect(out.passed_flags).toEqual([false, true, true])
    expect(out.passed).toBe(true)
    expect(out.pass_flip).toBe(false)
    expect(out.unstable).toBe(true)
    expect(out.ok).toBe(true)
    expect(out.output?.passed).toBe(true)
    expect(out.output?.passed_flags).toEqual([false, true, true])
    expect(out.output?.passing_score).toBe(70)
    expect(out.output?.majority_passed).toBe(true)
    expect(out.output?.reasons).toEqual([])
  })
  it('throws when every repeat errors', async () => {
    const bad = new MockLanguageModelV4({ doGenerate: (async () => textResult('not json')) as never })
    await expect(runGradedCase({ grader: bad, exercise }, testCase({ score: 50 }))).rejects.toThrow()
  })
  it('artifact exercises pass through the artifact grader', async () => {
    const out = await runGradedCase(
      { grader: graderModel([90]), exercise: { ...exercise, exercise_type: 'artifact' } },
      testCase({ score: 90 })
    )
    expect(out.score).toBe(90)
  })
})

describe('draftSampleAnswers', () => {
  const cats = ['high', 'mid', 'low', 'boundary', 'injection', 'keyword_stuffing', 'off_topic', 'short_correct']
  it('parses one sample per category and pins boundary to the passing score', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: (async () =>
        textResult(JSON.stringify({
          samples: [...cats, 'high'].map((category, i) => ({ name: `s${i}`, category, content: `answer ${i}`, expected_score: 55, rationale: 'r' })),
        }))) as never,
    })
    let calls = 0
    const out = await draftSampleAnswers(model, { exercise, passingScore: 70, onModelCall: () => { calls++ } })
    expect(calls).toBe(1)
    expect(out.map((s) => s.category)).toEqual(cats)
    expect(out.find((s) => s.category === 'boundary')?.expected_score).toBe(70)
  })
})
