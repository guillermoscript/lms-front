import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  generate: vi.fn(),
  resolve: vi.fn(),
  save: vi.fn(),
  flag: vi.fn(),
  markInvalid: vi.fn(),
  planAllowed: true,
  aiConfig: null as unknown,
}))

vi.mock('ai', async () => {
  class NoObjectGeneratedError extends Error {
    static isInstance(e: unknown) { return e instanceof NoObjectGeneratedError }
  }
  class NoOutputGeneratedError extends Error {
    static isInstance(e: unknown) { return e instanceof NoOutputGeneratedError }
  }
  return {
    generateText: (input: unknown) => state.generate(input),
    Output: { object: (o: unknown) => ({ kind: 'object', ...(o as object) }) },
    NoObjectGeneratedError,
    NoOutputGeneratedError,
  }
})
vi.mock('@langfuse/tracing', () => ({
  propagateAttributes: (_a: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/plans/server', () => ({ hasPlanFeature: async () => state.planAllowed }))
vi.mock('@/lib/ai/tenant-ai', () => ({
  createTenantAi: () => ({ getModelForFeature: state.resolve, lastProviderId: () => 'openai' }),
}))
vi.mock('@/lib/ai/errors', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/errors')>('@/lib/ai/errors')
  return { ...actual, markCredentialInvalid: state.markInvalid }
})
vi.mock('@/lib/exams/grading-secrets', () => ({
  EXAM_GRADING_SECRETS_EMBED: '',
  withExamGradingSecrets: (q: unknown) => q,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'exam_questions') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                { question_id: 1, question_text: 'Pick', question_type: 'multiple_choice', points: 10, options: [{ option_id: 5, option_text: 'a', is_correct: true }] },
                { question_id: 2, question_text: 'Explain', question_type: 'free_text', points: 10, options: [] },
              ],
              error: null,
            }),
          }),
        }
      }
      if (table === 'exam_ai_configs') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.aiConfig }) }) }) }
      }
      if (table === 'exam_submissions') {
        return { update: (v: unknown) => ({ eq: () => ({ eq: async () => { state.flag(v); return { error: null } } }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (name: string, args: unknown) => {
      if (name === 'save_exam_feedback') { state.save(args); return { error: null } }
      throw new Error(name)
    },
  }),
}))

import { gradeExamSubmission, normalizeAiScores } from '@/lib/exams/grade'
import { AiKeyInvalidError, AiNotConfiguredError, AiProviderQuotaError } from '@/lib/ai/errors'

function userClient() {
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {}
    c.select = () => c
    c.eq = () => c
    c.maybeSingle = async () => ({ data })
    c.then = (r: (v: unknown) => unknown) => r({ data })
    return c
  }
  return {
    from: (table: string) => {
      if (table === 'exam_submissions') return chain({ submission_id: 9, exam_id: 3, review_status: 'pending' })
      if (table === 'exams') return chain({ exam_id: 3, title: 'T', description: null })
      if (table === 'exam_answers') return chain([{ question_id: 1, answer_text: '5' }, { question_id: 2, answer_text: 'my essay' }])
      throw new Error(table)
    },
  } as never
}

const args = () => ({ supabase: userClient(), userId: 'u1', tenantId: 't1', submissionId: 9, examId: 3, locale: 'en' })
const grader = { model: 'school-model', providerId: 'anthropic', modelId: 'claude-x' }

beforeEach(() => {
  Object.values(state).forEach((v) => typeof v === 'function' && 'mockReset' in v && (v as ReturnType<typeof vi.fn>).mockReset())
  state.planAllowed = true
  state.aiConfig = null
})

describe('exam grading on the school key (BYOK)', () => {
  it('grades free text with Output.object and records the real model id', async () => {
    state.resolve.mockResolvedValue(grader)
    state.generate.mockResolvedValue({
      output: {
        questions: [
          { question_id: 2, is_correct: true, points_earned: 99, feedback: 'good', confidence: 0.9 },
          { question_id: 777, is_correct: true, points_earned: 10, feedback: 'foreign', confidence: 1 },
        ],
        overall_feedback: 'nice',
      },
    })
    const out = await gradeExamSubmission(args())
    expect(out.ok).toBe(true)
    const input = state.generate.mock.calls[0][0]
    expect(input.model).toBe('school-model')
    expect(input.output.kind).toBe('object')
    const saved = state.save.mock.calls[0][0]
    expect(saved.p_ai_model).toBe('claude-x')
    // points clamped to the question's worth, foreign ids dropped
    expect(Object.keys(saved.p_question_feedback).sort()).toEqual(['1', '2'])
    expect(saved.p_question_feedback['2'].points_earned).toBe(10)
    expect(saved.p_score).toBe(100)
  })

  it('keeps the submission pending when the model omits or mis-ids a free-text question', async () => {
    state.resolve.mockResolvedValue(grader)
    state.generate.mockResolvedValue({
      output: {
        questions: [{ question_id: 1, is_correct: true, points_earned: 10, feedback: 'sequential id', confidence: 0.9 }],
        overall_feedback: 'nice',
      },
    })
    const out = await gradeExamSubmission(args())
    expect(out).toMatchObject({ ok: false, status: 500 })
    expect(state.save).not.toHaveBeenCalled()
  })

  it('parks free text for the teacher when the school has no key, without calling the model', async () => {
    state.resolve.mockRejectedValue(new AiNotConfiguredError('no_key'))
    const out = await gradeExamSubmission(args())
    expect(out.ok).toBe(true)
    expect(state.generate).not.toHaveBeenCalled()
    const saved = state.save.mock.calls[0][0]
    expect(saved.p_ai_model).toBe('programmatic')
    expect(saved.p_overall_feedback).toBe('pending_teacher_review')
    expect(saved.p_score).toBe(50)
    expect(state.flag).toHaveBeenCalledWith({ review_status: 'pending_teacher_review', requires_attention: true })
  })

  it('parks when the stored key was already marked invalid', async () => {
    state.resolve.mockRejectedValue(new AiKeyInvalidError())
    expect((await gradeExamSubmission(args())).ok).toBe(true)
    expect(state.generate).not.toHaveBeenCalled()
    expect(state.flag).toHaveBeenCalled()
  })

  it('invalidates a key the provider rejects mid-call and parks', async () => {
    state.resolve.mockResolvedValue(grader)
    state.generate.mockRejectedValue(Object.assign(new Error('bad key'), { statusCode: 401 }))
    const out = await gradeExamSubmission(args())
    expect(out.ok).toBe(true)
    expect(state.markInvalid).toHaveBeenCalledWith('t1', 'anthropic', 'exam_grader', 'u1')
    expect(state.save.mock.calls[0][0].p_ai_model).toBe('programmatic')
  })

  it('keeps the submission pending (typed failure) on quota errors', async () => {
    state.resolve.mockResolvedValue(grader)
    state.generate.mockRejectedValue(new AiProviderQuotaError())
    const out = await gradeExamSubmission(args())
    expect(out).toMatchObject({ ok: false, status: 429, aiCode: 'ai_quota' })
    expect(state.save).not.toHaveBeenCalled()
  })

  it('does not resolve a model when AI grading is switched off or plan-gated', async () => {
    state.planAllowed = false
    const out = await gradeExamSubmission(args())
    expect(out.ok).toBe(true)
    expect(state.resolve).not.toHaveBeenCalled()
  })

  it('never echoes provider text in the failure', async () => {
    state.resolve.mockResolvedValue(grader)
    state.generate.mockRejectedValue(Object.assign(new Error('sk-secret-123 leaked'), { statusCode: 503 }))
    const out = await gradeExamSubmission(args())
    expect(JSON.stringify(out)).not.toContain('sk-secret')
  })
})

describe('normalizeAiScores', () => {
  it('clamps negatives and confidence', () => {
    const r = normalizeAiScores(
      { questions: [{ question_id: 2, is_correct: false, points_earned: -4, feedback: 'x', confidence: 5 }], overall_feedback: '' },
      [{ question_id: 2, points: 4 }],
      {},
    )
    expect(r['2']).toMatchObject({ points_earned: 0, confidence: 1, student_answer: 'No answer provided' })
  })
})
