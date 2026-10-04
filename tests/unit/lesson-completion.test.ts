import { describe, expect, it } from 'vitest'
import { findLessonCompletion, lessonCompletionOutput } from '@/lib/ai/lesson-completion'
import { LESSON_COMPLETION_PROTOCOL, PROMPTS } from '@/lib/ai/prompts'

const assistant = (parts: unknown[]) => ({ role: 'assistant' as const, parts: parts as never })

describe('findLessonCompletion', () => {
    it('ignores a call the tool has not answered yet', () => {
        const messages = [assistant([{ type: 'tool-markLessonCompleted', toolCallId: 'a', state: 'input-available' }])]
        expect(findLessonCompletion(messages)).toBeNull()
    })

    it('ignores a call the tool refused (required checkpoints still open)', () => {
        const part = { type: 'tool-markLessonCompleted', toolCallId: 'a', state: 'output-available', output: { success: false, error: 'x' } }
        expect(lessonCompletionOutput(part)).toEqual({ success: false, error: 'x' })
        expect(findLessonCompletion([assistant([part])])).toBeNull()
    })

    it('returns the feedback of a granted completion', () => {
        const messages = [
            assistant([{ type: 'text', text: 'Good' }]),
            assistant([
                { type: 'text', text: '¡Misión cumplida!' },
                { type: 'tool-markLessonCompleted', toolCallId: 'b', state: 'output-available', output: { success: true, feedback: 'Great job' } },
            ]),
        ]
        expect(findLessonCompletion(messages)).toMatchObject({ toolCallId: 'b', feedback: 'Great job' })
    })
})

describe('lesson tutor prompt', () => {
    const teacherPrompt = 'Eres un tutor de inglés. REQUISITOS: 1. Saludar 2. Pedir un café'

    it('carries the completion protocol even when the teacher overrides the system prompt', () => {
        const prompt = PROMPTS.lessonTutor({ title: 'Cafetería' }, { system_prompt: teacherPrompt, task_instructions: 'Pide un café' })
        expect(prompt).toContain(teacherPrompt)
        expect(prompt).toContain(LESSON_COMPLETION_PROTOCOL)
        expect(prompt).toContain('markLessonCompleted')
    })

    it('gives the editor preview the very prompt a student gets', () => {
        const lesson = { title: 'Cafetería', description: 'd', content: 'c' }
        const task = { system_prompt: teacherPrompt, task_instructions: 'Pide un café' }
        expect(PROMPTS.previewLesson(lesson, task)).toBe(PROMPTS.lessonTutor(lesson, task))
    })
})

describe('markLessonCompleted', () => {
    const run = async (done: boolean) => {
        const { createPreviewLessonTools } = await import('@/lib/ai/tools')
        const tools = createPreviewLessonTools(async () => ({ done, reason: 'requirement 3 not met' }))
        return tools.markLessonCompleted.execute!({ feedback: 'ok' }, { toolCallId: 't', messages: [] } as never)
    }

    it('refuses when the verifier disagrees with the tutor, and says what is missing', async () => {
        const output = (await run(false)) as { success: boolean; error?: string }
        expect(output.success).toBe(false)
        expect(output.error).toContain('requirement 3 not met')
    })

    it('completes when the verifier agrees', async () => {
        expect(await run(true)).toMatchObject({ success: true, feedback: 'ok' })
    })
})
