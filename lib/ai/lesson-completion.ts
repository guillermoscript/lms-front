import type { UIMessage } from 'ai'

export const MARK_LESSON_COMPLETED_PART = 'tool-markLessonCompleted'

export interface LessonCompletionOutput {
    success?: boolean
    feedback?: string
    error?: string
    /** Set by the editor preview's dry-run tool: nothing was written. */
    preview?: boolean
}

interface ToolPartLike {
    type: string
    toolCallId?: string
    state?: string
    output?: unknown
}

/**
 * The tutor's `markLessonCompleted` call, once the tool has ANSWERED.
 *
 * A call is not a completion: the tool refuses while required checkpoints are
 * open, so only `output-available` with `success: true` counts. Reading the
 * call itself (`onToolCall`) celebrated lessons the server had just refused.
 */
export function lessonCompletionOutput(part: ToolPartLike): LessonCompletionOutput | null {
    if (part.type !== MARK_LESSON_COMPLETED_PART || part.state !== 'output-available') return null
    return (part.output ?? {}) as LessonCompletionOutput
}

/** The successful completion in a conversation, if the tutor has granted one. */
export function findLessonCompletion(
    messages: Pick<UIMessage, 'role' | 'parts'>[]
): (LessonCompletionOutput & { toolCallId: string }) | null {
    for (const message of messages) {
        if (message.role !== 'assistant') continue
        for (const part of message.parts as ToolPartLike[]) {
            const output = lessonCompletionOutput(part)
            if (output?.success) return { ...output, toolCallId: part.toolCallId ?? '' }
        }
    }
    return null
}
