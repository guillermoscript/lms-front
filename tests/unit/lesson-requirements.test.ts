import { describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_MIN_STUDENT_TURNS,
    latestReportedProgress,
    parseStructuredRequirements,
    requirementIds,
    structuredRequirementsSchema,
    structuredRequirementsSummary,
} from '@/lib/ai/lesson-requirements'
import { PROMPTS, buildStructuredTutorPrompt } from '@/lib/ai/prompts'

const validStructured = {
    level: 'Beginner',
    scenario: 'Order a coffee at a cafe.',
    tutor_role: 'Friendly barista',
    requirements: [
        { id: 'r1', text: 'Greet the barista' },
        { id: 'r2', text: 'Order a drink and a size' },
    ],
    closing_phase: 'Recap the full order before paying.',
    min_student_turns: 3,
}

describe('structuredRequirementsSchema', () => {
    it('accepts a fully specified structured task', () => {
        const result = structuredRequirementsSchema.safeParse(validStructured)
        expect(result.success).toBe(true)
    })

    it('defaults min_student_turns to 4 when omitted', () => {
        const rest: Partial<typeof validStructured> = { ...validStructured }
        delete rest.min_student_turns
        const result = structuredRequirementsSchema.parse(rest)
        expect(result.min_student_turns).toBe(DEFAULT_MIN_STUDENT_TURNS)
    })

    it('rejects an empty requirement list', () => {
        const result = structuredRequirementsSchema.safeParse({ ...validStructured, requirements: [] })
        expect(result.success).toBe(false)
    })

    it('rejects a requirement with no text', () => {
        const result = structuredRequirementsSchema.safeParse({
            ...validStructured,
            requirements: [{ id: 'r1', text: '' }],
        })
        expect(result.success).toBe(false)
    })
})

describe('parseStructuredRequirements', () => {
    it('returns null for NULL — the free-text compatibility contract', () => {
        expect(parseStructuredRequirements(null)).toBeNull()
        expect(parseStructuredRequirements(undefined)).toBeNull()
    })

    it('returns null for a shape that fails validation, never throws', () => {
        expect(parseStructuredRequirements({ level: 'x' })).toBeNull()
        expect(parseStructuredRequirements('not an object')).toBeNull()
        expect(parseStructuredRequirements(42)).toBeNull()
    })

    it('parses a valid row', () => {
        expect(parseStructuredRequirements(validStructured)).toMatchObject({ level: 'Beginner' })
    })
})

describe('requirementIds', () => {
    it('returns the ordered ids', () => {
        expect(requirementIds(structuredRequirementsSchema.parse(validStructured))).toEqual(['r1', 'r2'])
    })

    it('returns an empty array for null/undefined', () => {
        expect(requirementIds(null)).toEqual([])
        expect(requirementIds(undefined)).toEqual([])
    })
})

describe('structuredRequirementsSummary', () => {
    it('lists the scenario, numbered requirements, and closing phase', () => {
        const summary = structuredRequirementsSummary(structuredRequirementsSchema.parse(validStructured))
        expect(summary).toContain('Order a coffee at a cafe.')
        expect(summary).toContain('1. Greet the barista')
        expect(summary).toContain('2. Order a drink and a size')
        expect(summary).toContain('Recap the full order before paying.')
    })
})

describe('latestReportedProgress', () => {
    const assistant = (parts: unknown[]) => ({ role: 'assistant' as const, parts: parts as never })

    it('returns empty when nothing has been reported', () => {
        expect(latestReportedProgress([])).toEqual([])
    })

    it('ignores a reportProgress call the tool has not answered yet', () => {
        const messages = [assistant([{ type: 'tool-reportProgress', state: 'input-available' }])]
        expect(latestReportedProgress(messages)).toEqual([])
    })

    it('returns the most recent reported set, not an earlier one', () => {
        const messages = [
            assistant([{ type: 'tool-reportProgress', state: 'output-available', output: { met: ['r1'] } }]),
            assistant([{ type: 'text', text: 'ok' }]),
            assistant([{ type: 'tool-reportProgress', state: 'output-available', output: { met: ['r1', 'r2'] } }]),
        ]
        expect(latestReportedProgress(messages)).toEqual(['r1', 'r2'])
    })
})

describe('buildStructuredTutorPrompt / PROMPTS.lessonTutor structured branch', () => {
    const lesson = { title: 'Cafeteria', description: 'd', content: 'c' }
    const structured = structuredRequirementsSchema.parse(validStructured)

    it('carries level, scenario, tutor role, and every requirement in order', () => {
        const prompt = buildStructuredTutorPrompt(lesson, structured)
        expect(prompt).toContain('Beginner')
        expect(prompt).toContain('Order a coffee at a cafe.')
        expect(prompt).toContain('Friendly barista')
        expect(prompt).toContain('[r1] Greet the barista')
        expect(prompt).toContain('[r2] Order a drink and a size')
        expect(prompt).toContain('reportProgress')
    })

    it('lessonTutor uses the structured prompt instead of the free-text one when requirements are set', () => {
        const prompt = PROMPTS.lessonTutor(lesson, { system_prompt: 'ignored teacher text', requirements: structured })
        expect(prompt).toContain('Friendly barista')
        expect(prompt).not.toContain('ignored teacher text')
        expect(prompt).toContain('markLessonCompleted')
    })

    it('lessonTutor falls back to the free-text template when requirements is null (compatibility contract)', () => {
        const prompt = PROMPTS.lessonTutor(lesson, { system_prompt: 'teacher text', task_instructions: 'do the thing', requirements: null })
        expect(prompt).toContain('teacher text')
        expect(prompt).toContain('do the thing')
    })
})

describe('reportProgress tool', () => {
    it('echoes back only known requirement ids, and the total', async () => {
        const { createReportProgressTool } = await import('@/lib/ai/tools')
        const tool = createReportProgressTool(['r1', 'r2'])
        const output = await tool.execute!({ met: ['r1', 'unknown'] }, { toolCallId: 't', messages: [] } as never)
        expect(output).toEqual({ met: ['r1'], total: 2 })
    })
})

const FAKE_MODEL = { specificationVersion: 'v3', provider: 'test', modelId: 'test' } as never

describe('lesson-completion-verifier min_student_turns rule', () => {
    it('refuses before calling the model when the student has not sent enough messages', async () => {
        vi.resetModules()
        const generateTextSpy = vi.fn()
        vi.doMock('ai', () => ({
            generateText: generateTextSpy,
            Output: { object: () => ({}) },
        }))
        const { verifyLessonCompletion } = await import('@/lib/ai/lesson-completion-verifier')

        const structured = structuredRequirementsSchema.parse({ ...validStructured, min_student_turns: 4 })
        const messages = [
            { role: 'user', parts: [{ type: 'text', text: 'hi' }] },
            { role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
        ]

        const verdict = await verifyLessonCompletion({ model: FAKE_MODEL, structuredRequirements: structured, messages })
        expect(verdict.done).toBe(false)
        expect(verdict.reason).toContain('at least 4')
        expect(generateTextSpy).not.toHaveBeenCalled()
        vi.doUnmock('ai')
        vi.resetModules()
    })

    it('allows a one-shot answer when min_student_turns is 0', async () => {
        vi.resetModules()
        vi.doMock('ai', () => ({
            generateText: vi.fn().mockResolvedValue({
                output: { requirement_status: [{ id: 'r1', met: true }, { id: 'r2', met: true }], closing_phase: 'delivered' },
            }),
            Output: { object: () => ({}) },
        }))
        const { verifyLessonCompletion } = await import('@/lib/ai/lesson-completion-verifier')

        const structured = structuredRequirementsSchema.parse({ ...validStructured, min_student_turns: 0, closing_phase: undefined })
        const messages = [{ role: 'user', parts: [{ type: 'text', text: 'Hi, I would like a large latte please, thanks!' }] }]

        const verdict = await verifyLessonCompletion({ model: FAKE_MODEL, structuredRequirements: structured, messages })
        expect(verdict.done).toBe(true)
        vi.doUnmock('ai')
        vi.resetModules()
    })
})

describe('lesson-completion-verifier failure policy', () => {
    const structured = structuredRequirementsSchema.parse({ ...validStructured, min_student_turns: 0, closing_phase: undefined })
    const messages = [{ role: 'user', parts: [{ type: 'text', text: 'I would like a large latte please' }] }]

    async function verifyWithError(makeError: unknown | (() => Promise<unknown>)) {
        vi.resetModules()
        vi.doMock('ai', () => ({
            generateText: vi.fn().mockImplementation(async () => {
                // Built after the module reset so `instanceof AiError` matches the verifier's copy.
                throw typeof makeError === 'function' ? await (makeError as () => Promise<unknown>)() : makeError
            }),
            Output: { object: () => ({}) },
        }))
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { verifyLessonCompletion } = await import('@/lib/ai/lesson-completion-verifier')
        const verdict = await verifyLessonCompletion({ model: FAKE_MODEL, structuredRequirements: structured, messages })
        const freeText = await verifyLessonCompletion({ model: FAKE_MODEL, taskInstructions: 'x', messages })
        spy.mockRestore()
        vi.doUnmock('ai')
        vi.resetModules()
        return { verdict, freeText }
    }

    const http = (statusCode: number, message = 'boom') => Object.assign(new Error(message), { name: 'AI_APICallError', statusCode })

    it.each([
        ['invalid key (401)', http(401)],
        ['quota (429)', http(429)],
        ['unsupported model (404)', http(404)],
    ])('fails CLOSED on %s', async (_label, error) => {
        const { verdict, freeText } = await verifyWithError(error)
        for (const v of [verdict, freeText]) {
            expect(v.done).toBe(false)
            expect(v.unavailable).toBe('ai_unavailable')
        }
    })

    it('fails CLOSED when no key is configured', async () => {
        const { verdict } = await verifyWithError(async () => {
            const { AiNotConfiguredError } = await import('@/lib/ai/errors')
            return new AiNotConfiguredError('no_key')
        })
        expect(verdict.done).toBe(false)
        expect(verdict.unavailable).toBe('ai_unavailable')
    })

    it.each([
        ['5xx', http(503)],
        ['timeout/network (no status)', Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
    ])('fails OPEN only on a transient error: %s', async (_label, error) => {
        const { verdict, freeText } = await verifyWithError(error)
        expect(verdict).toEqual({ done: true, reason: '' })
        expect(freeText).toEqual({ done: true, reason: '' })
    })

    it.each([
        ['schema failure (NoObjectGeneratedError)', Object.assign(new Error('No object generated'), { name: 'AI_NoObjectGeneratedError' })],
        ['bug in our code (TypeError)', new TypeError("Cannot read properties of undefined (reading 'x')")],
        ['unknown error', new Error('boom')],
    ])('fails CLOSED on a status-less non-network error: %s', async (_label, error) => {
        const { verdict, freeText } = await verifyWithError(error)
        for (const v of [verdict, freeText]) {
            expect(v.done).toBe(false)
            expect(v.unavailable).toBe('ai_unavailable')
        }
    })

    it('never puts the provider message in the verdict', async () => {
        const { verdict } = await verifyWithError(http(401, 'Incorrect API key provided: sk-secret123'))
        expect(JSON.stringify(verdict)).not.toContain('sk-secret123')
    })
})

describe('markLessonCompleted when the verifier is unavailable', () => {
    it('refuses without writing and tells the tutor not to claim completion', async () => {
        const { createLessonTools } = await import('@/lib/ai/tools')
        const from = vi.fn()
        const tools = createLessonTools({ from } as never, {
            lessonId: '1',
            userId: 'u',
            verify: async () => ({ done: false, reason: 'unavailable', unavailable: 'ai_unavailable' }),
        })
        const out = (await tools.markLessonCompleted.execute!({ feedback: 'great' }, { toolCallId: 't', messages: [] } as never)) as { success: boolean; code?: string }
        expect(out.success).toBe(false)
        expect(out.code).toBe('ai_unavailable')
        expect(from).not.toHaveBeenCalled()
    })
})
