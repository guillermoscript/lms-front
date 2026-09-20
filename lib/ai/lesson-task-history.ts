import { MARK_LESSON_COMPLETED_PART, type LessonCompletionOutput } from '@/lib/ai/lesson-completion'

/**
 * Rebuilds a persisted `lessons_ai_task_messages` row's `tool_invocations`
 * into AI-SDK v7 message parts, and reads the completion + verifier verdict
 * back out of them for the teacher audit surface (#805).
 *
 * WHY THIS EXISTS
 *   `/api/chat/lesson-task`'s `onFinish` persists the assistant's TEXT, but
 *   until now nothing wrote the tool call itself: on reload the "Target
 *   achieved" card vanished from history and a teacher had no way to see why
 *   a lesson was granted. `onFinish` now writes each `markLessonCompleted`
 *   tool result into `tool_invocations` in the shape `StoredToolInvocation`
 *   below; this module is the one place that reads it back, so the student
 *   chat (rebuilding `initialMessages`) and the teacher audit route (reading
 *   raw rows) agree on what a stored call means.
 *
 * BUMP `LESSON_TASK_TOOL_INVOCATION_VERSION` if the stored shape changes in
 * a way `fromCurrentShape` must branch on — old rows keep whatever version
 * they were written with and this mapper must keep reading them.
 */
export const LESSON_TASK_TOOL_INVOCATION_VERSION = 1

/** What `onFinish` writes per tool call. */
export interface StoredToolInvocation {
    version: number
    toolName: string
    toolCallId: string
    input: unknown
    output: LessonCompletionOutput
}

/** The pre-#805 shape a row from between #804 and this shipping may carry. */
interface LegacyToolInvocationEntry {
    toolInvocation?: {
        toolCallId?: string
        toolName?: string
        state?: string
        args?: unknown
        result?: unknown
    }
}

export interface RebuiltLessonTaskToolPart {
    type: typeof MARK_LESSON_COMPLETED_PART
    toolCallId: string
    state: 'output-available'
    input: unknown
    output: LessonCompletionOutput
}

function fromCurrentShape(
    row: Partial<StoredToolInvocation>,
    index: number
): RebuiltLessonTaskToolPart | null {
    if (row.toolName !== 'markLessonCompleted') return null
    return {
        type: MARK_LESSON_COMPLETED_PART,
        toolCallId: row.toolCallId || `tool-invocation-${index}`,
        state: 'output-available',
        input: row.input ?? {},
        output: (row.output ?? {}) as LessonCompletionOutput,
    }
}

function fromLegacyShape(
    row: LegacyToolInvocationEntry,
    index: number
): RebuiltLessonTaskToolPart | null {
    const invocation = row.toolInvocation
    if (!invocation || invocation.toolName !== 'markLessonCompleted') return null
    return {
        type: MARK_LESSON_COMPLETED_PART,
        toolCallId: invocation.toolCallId || `tool-invocation-${index}`,
        state: 'output-available',
        input: invocation.args ?? {},
        output: (invocation.result ?? {}) as LessonCompletionOutput,
    }
}

/**
 * Turns one row's `tool_invocations` value into v7 `tool-markLessonCompleted`
 * parts. Tolerates whatever is actually in the column — `null`, a bare
 * object instead of an array, the pre-#805 `{toolInvocation}` shape, or
 * garbage — by skipping anything it cannot map rather than throwing, so one
 * malformed row never blanks a lesson's whole history.
 */
export function rebuildLessonTaskToolParts(toolInvocations: unknown): RebuiltLessonTaskToolPart[] {
    if (!toolInvocations) return []
    const entries = Array.isArray(toolInvocations) ? toolInvocations : [toolInvocations]

    const parts: RebuiltLessonTaskToolPart[] = []
    entries.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return
        const row = entry as Partial<StoredToolInvocation> & LegacyToolInvocationEntry
        const part = fromCurrentShape(row, index) ?? fromLegacyShape(row, index)
        if (part) parts.push(part)
    })
    return parts
}

export interface StoredLessonCompletionSummary {
    feedback?: string
    requirementsCheck?: string
    completedAt: string
}

/**
 * The most recent GRANTED completion across a student's messages for one
 * lesson, for the teacher audit route — a refusal (`success: false`) never
 * qualifies. `rows` should be newest-first; ties across a restart resolve to
 * the newest conversation, matching what the student currently sees.
 */
export function findStoredLessonCompletion(
    rows: { tool_invocations: unknown; created_at: string }[]
): StoredLessonCompletionSummary | null {
    for (const row of rows) {
        for (const part of rebuildLessonTaskToolParts(row.tool_invocations)) {
            if (!part.output?.success) continue
            return {
                feedback: part.output.feedback,
                requirementsCheck: part.output.requirementsCheck,
                completedAt: row.created_at,
            }
        }
    }
    return null
}
