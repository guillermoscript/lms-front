import { describe, expect, it } from 'vitest'
import { lessonCompletionOutput } from '@/lib/ai/lesson-completion'
import { findStoredLessonCompletion, rebuildLessonTaskToolParts } from '@/lib/ai/lesson-task-history'

describe('rebuildLessonTaskToolParts', () => {
    it('returns nothing for a row with no tool call', () => {
        expect(rebuildLessonTaskToolParts(null)).toEqual([])
        expect(rebuildLessonTaskToolParts(undefined)).toEqual([])
    })

    it('rebuilds a persisted markLessonCompleted call into a v7 tool part', () => {
        const stored = [
            {
                version: 1,
                toolName: 'markLessonCompleted',
                toolCallId: 'call_1',
                input: { feedback: 'Nice work' },
                output: { success: true, feedback: 'Nice work', requirementsCheck: '1. met — student said hello' },
            },
        ]
        const parts = rebuildLessonTaskToolParts(stored)
        expect(parts).toHaveLength(1)
        expect(parts[0]).toMatchObject({
            type: 'tool-markLessonCompleted',
            toolCallId: 'call_1',
            state: 'output-available',
        })
        // The rebuilt part must satisfy the same reader the live stream uses.
        expect(lessonCompletionOutput(parts[0])).toMatchObject({ success: true, feedback: 'Nice work' })
    })

    it('ignores a stored call for a different tool', () => {
        expect(rebuildLessonTaskToolParts([{ toolName: 'markExerciseCompleted', output: {} }])).toEqual([])
    })

    it('ignores a refused call (the tool refused, nothing was granted)', () => {
        const stored = [
            {
                toolName: 'markLessonCompleted',
                toolCallId: 'call_2',
                output: { success: false, error: 'missing requirement' },
            },
        ]
        const parts = rebuildLessonTaskToolParts(stored)
        expect(parts).toHaveLength(1)
        expect(lessonCompletionOutput(parts[0])).toMatchObject({ success: false })
    })

    it('tolerates malformed entries without throwing', () => {
        expect(() => rebuildLessonTaskToolParts([{}, 'garbage', 42, null])).not.toThrow()
        expect(rebuildLessonTaskToolParts([{}, 'garbage', 42, null])).toEqual([])
    })

    it('rebuilds the pre-#805 {toolInvocation} legacy shape', () => {
        const stored = [
            {
                toolInvocation: {
                    toolCallId: 'legacy_1',
                    toolName: 'markLessonCompleted',
                    state: 'result',
                    args: { feedback: 'ok' },
                    result: { success: true, feedback: 'ok' },
                },
            },
        ]
        const parts = rebuildLessonTaskToolParts(stored)
        expect(parts).toHaveLength(1)
        expect(parts[0]).toMatchObject({ toolCallId: 'legacy_1', state: 'output-available' })
        expect(lessonCompletionOutput(parts[0])).toMatchObject({ success: true, feedback: 'ok' })
    })

    it('accepts a single object as well as an array', () => {
        const stored = { toolName: 'markLessonCompleted', toolCallId: 'x', output: { success: true } }
        expect(rebuildLessonTaskToolParts(stored)).toHaveLength(1)
    })
})

describe('findStoredLessonCompletion', () => {
    it('returns null when nothing was granted', () => {
        expect(findStoredLessonCompletion([])).toBeNull()
        expect(
            findStoredLessonCompletion([{ tool_invocations: null, created_at: '2026-01-01T00:00:00Z' }])
        ).toBeNull()
        expect(
            findStoredLessonCompletion([
                {
                    tool_invocations: [{ toolName: 'markLessonCompleted', output: { success: false } }],
                    created_at: '2026-01-01T00:00:00Z',
                },
            ])
        ).toBeNull()
    })

    it('surfaces the feedback and requirementsCheck of a granted completion', () => {
        const summary = findStoredLessonCompletion([
            {
                tool_invocations: [
                    {
                        toolName: 'markLessonCompleted',
                        output: { success: true, feedback: 'Great job', requirementsCheck: '1. met' },
                    },
                ],
                created_at: '2026-02-01T10:00:00Z',
            },
        ])
        expect(summary).toEqual({
            feedback: 'Great job',
            requirementsCheck: '1. met',
            completedAt: '2026-02-01T10:00:00Z',
        })
    })

    it('takes the first granted completion in row order (rows should be newest-first)', () => {
        const summary = findStoredLessonCompletion([
            {
                tool_invocations: [{ toolName: 'markLessonCompleted', output: { success: true, feedback: 'second try' } }],
                created_at: '2026-02-02T00:00:00Z',
            },
            {
                tool_invocations: [{ toolName: 'markLessonCompleted', output: { success: true, feedback: 'first try' } }],
                created_at: '2026-02-01T00:00:00Z',
            },
        ])
        expect(summary?.feedback).toBe('second try')
    })
})
