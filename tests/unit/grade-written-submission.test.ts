/** Rounding / pass decision of the shared grader used by the student routes and AI evals. */
import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { gradeWrittenSubmission } from '@/lib/exercises/grade-written-submission'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
}
const model = (score: number) =>
  new MockLanguageModelV4({
    doGenerate: (async () => ({
      content: [{ type: 'text', text: JSON.stringify({ score, feedback: 'ok', strengths: ['a'], improvements: ['b'] }) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    })) as never,
  })

const written = (passing_score?: number) => ({
  title: 'Essay', instructions: 'Explain X', exercise_type: 'essay',
  exercise_config: passing_score === undefined ? {} : { passing_score },
})
const artifact = (passing_score?: number) => ({
  title: 'Art', instructions: 'Build X', exercise_type: 'artifact',
  exercise_config: passing_score === undefined ? {} : { passing_score },
})

describe('gradeWrittenSubmission rounding and pass decision', () => {
  it('written: 69.6 rounds to 70 and passes at 70', async () => {
    const r = await gradeWrittenSubmission(written(70), 'answer', model(69.6))
    expect(r.score).toBe(70)
    expect(r.passed).toBe(true)
  })
  it('written: 69.4 rounds to 69 and fails at 70', async () => {
    const r = await gradeWrittenSubmission(written(70), 'answer', model(69.4))
    expect(r.score).toBe(69)
    expect(r.passed).toBe(false)
  })
  it('artifact: 69.6 rounds to 70 and passes at 70', async () => {
    const r = await gradeWrittenSubmission(artifact(70), 'html', model(69.6), {})
    expect(r.score).toBe(70)
    expect(r.passed).toBe(true)
    expect(r.passingScore).toBe(70)
  })
  it('artifact: default passing score is 70, custom is honoured and clamped', async () => {
    expect((await gradeWrittenSubmission(artifact(), 'h', model(70))).passingScore).toBe(70)
    expect((await gradeWrittenSubmission(artifact(85), 'h', model(84.4))).passed).toBe(false)
    expect((await gradeWrittenSubmission(artifact(150), 'h', model(100))).passingScore).toBe(100)
  })
})
