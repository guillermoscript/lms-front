/**
 * Checkpoint evals (F2b): the extracted checkpoint grader keeps the route's
 * prompt/schema/clamping, runGradedCase can run it through the `grade`
 * override, and the runner dispatches target_type `checkpoint` to it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  run: null as null | Record<string, unknown>,
  exerciseRow: null as null | Record<string, unknown>,
  cases: [] as Record<string, unknown>[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as { table: string; patch: Record<string, unknown> }[],
  filters: [] as { table: string; col: string; val: unknown }[],
  feature: [] as string[],
  model: null as unknown,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      let mode: 'select' | 'update' | 'insert' = 'select'
      const b: Record<string, unknown> = {}
      const result = () => {
        if (table === 'ai_eval_runs' && mode === 'update') return { data: state.run }
        if (table === 'lesson_checkpoints') return { data: state.exerciseRow }
        if (table === 'ai_eval_cases') return { data: state.cases }
        return { data: null, error: null }
      }
      for (const m of ['select', 'eq', 'order', 'limit', 'in', 'lt', 'gte', 'delete']) {
        b[m] = (...args: unknown[]) => {
          if (m === 'eq') state.filters.push({ table, col: String(args[0]), val: args[1] })
          return b
        }
      }
      b.update = (patch: Record<string, unknown>) => { mode = 'update'; state.updates.push({ table, patch }); return b }
      b.insert = (row: Record<string, unknown>) => { mode = 'insert'; state.inserts.push({ table, row }); return b }
      b.maybeSingle = async () => result()
      b.then = (resolve: (v: unknown) => unknown) => resolve(result())
      return b
    },
  }),
}))

vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({
    getModelForFeature: async (feature: string) => {
      state.feature.push(feature)
      return { providerId: 'mock', modelId: 'm', model: state.model }
    },
  }),
}))

import { gradeCheckpointAnswer, checkpointPassingScore } from '@/lib/checkpoints/grade-checkpoint-answer'
import { runGradedCase } from '@/lib/ai/evals/graded-answer-engine'
import { executeEvalRun } from '@/lib/ai/evals/runner'
import { gradedExpectedSchema, type GradedCaseRow } from '@/lib/ai/evals/schema'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
}
const textResult = (text: string) => ({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })

function checkpointModel(scores: number[], seen: unknown[] = []) {
  let i = 0
  return new MockLanguageModelV4({
    doGenerate: (async (options: unknown) => {
      seen.push(options)
      const score = scores[Math.min(i++, scores.length - 1)]
      return textResult(JSON.stringify({ score, meets_expectations: score >= 70, feedback: 'fb', next_step_hint: 'next' }))
    }) as never,
  })
}

const exercise = {
  title: 'Reflect',
  instructions: 'Explain X',
  system_prompt: 'Be strict.',
  exercise_type: 'essay',
  exercise_config: { passing_score: 60, evaluation_criteria: 'Mentions Y' },
}

function testCase(score: number): GradedCaseRow {
  return {
    id: 'c1', kind: 'graded_answer', source: 'teacher', name: 'n', importance_note: null,
    expected: gradedExpectedSchema.parse({ score }),
    input: { content: 'my answer' }, golden_output: null, generated_for_version_id: null, teacher_edited: false,
  }
}

describe('gradeCheckpointAnswer', () => {
  it('keeps the checkpoint prompt and rounds/clamps the score', async () => {
    const seen: unknown[] = []
    const out = await gradeCheckpointAnswer(exercise, 'my answer', checkpointModel([84.6], seen) as never)
    expect(out).toEqual({ score: 85, meets_expectations: true, feedback: 'fb', next_step_hint: 'next' })
    const call = JSON.stringify(seen[0])
    expect(call).toContain('Be strict.')
    expect(call).toContain('You are evaluating one short student checkpoint answer. Be fair, concise, and formative.')
    expect(call).toContain('## Evaluation criteria:\\nMentions Y')
    expect(call).toContain('## Student answer:\\nmy answer')
  })
  it('falls back to the generic system prompt and config.system_prompt', async () => {
    const seen: unknown[] = []
    await gradeCheckpointAnswer({ ...exercise, system_prompt: null, exercise_config: {} }, 'a', checkpointModel([50], seen) as never)
    expect(JSON.stringify(seen[0])).toContain('You are an expert educational evaluator.')
    const seen2: unknown[] = []
    await gradeCheckpointAnswer({ ...exercise, system_prompt: null, exercise_config: { system_prompt: 'Cfg prompt' } }, 'a', checkpointModel([50], seen2) as never)
    expect(JSON.stringify(seen2[0])).toContain('Cfg prompt')
  })
  it('passing score defaults to 70', () => {
    expect(checkpointPassingScore({})).toBe(70)
    expect(checkpointPassingScore({ passing_score: 55 })).toBe(55)
  })
})

describe('runGradedCase with a grade override', () => {
  it('uses the override instead of the exercise grader', async () => {
    const grade = vi.fn(async () => ({
      score: 75, passed: true, passingScore: 60,
      evaluation: { score: 75, feedback: 'f', strengths: [], improvements: ['next'] },
    }))
    const out = await runGradedCase({ grader: {} as never, exercise, grade }, testCase(75))
    expect(grade).toHaveBeenCalledTimes(3)
    expect(out.scores).toEqual([75, 75, 75])
    expect(out.ok).toBe(true)
    expect(out.output?.improvements).toEqual(['next'])
    expect(out.passing_score).toBe(60)
  })
})

describe('executeEvalRun dispatch', () => {
  beforeEach(() => {
    Object.assign(state, { inserts: [], updates: [], filters: [], feature: [] })
    state.run = { id: 'r1', tenant_id: 't1', target_type: 'checkpoint', target_id: 9, version_id: 'v1' }
    state.exerciseRow = { id: 9, exercises: { ...exercise, tenant_id: 't1', exercise_grading_secrets: null } }
    state.cases = [{ ...testCase(80) }]
    state.model = checkpointModel([80])
  })

  it('runs a checkpoint target through the checkpoint grader and stores graded results', async () => {
    await executeEvalRun('r1', { actorId: 'u1' })
    expect(state.feature).toEqual(['checkpoint_grader'])
    const result = state.inserts.find((i) => i.table === 'ai_eval_results')?.row
    expect(result).toMatchObject({ tenant_id: 't1', run_id: 'r1', case_kind: 'graded_answer', score: 80, scores: [80, 80, 80], passed: true })
    expect(state.filters).toContainEqual({ table: 'ai_eval_cases', col: 'target_type', val: 'checkpoint' })
    expect(state.filters).toContainEqual({ table: 'ai_eval_cases', col: 'target_id', val: 9 })
    const done = state.updates.filter((u) => u.table === 'ai_eval_runs').at(-1)?.patch
    expect(done).toMatchObject({ status: 'done', summary: { total: 1, passed: 1, failed: 0, errors: 0, model_calls: 3 } })
  })

  it('fails the run when the checkpoint is gone', async () => {
    state.exerciseRow = null
    await executeEvalRun('r1')
    const last = state.updates.filter((u) => u.table === 'ai_eval_runs').at(-1)?.patch
    expect(last).toMatchObject({ status: 'failed', error: 'The checkpoint no longer exists.' })
  })
})
