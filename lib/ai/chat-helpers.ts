import { SupabaseClient } from '@supabase/supabase-js'

interface ChatMessagePart {
    type?: string
    text?: string
}

interface ChatMessage {
    role?: string
    parts?: ChatMessagePart[]
    content?: string
}

/**
 * Extract the text of the last message when it is a user message.
 * Joins all text parts (AI SDK v6 format), falling back to `.content`.
 * Returns null when the last message is not a user message.
 */
export function lastUserMessageText(messages: ChatMessage[] | undefined | null): string | null {
    const last = messages?.[messages.length - 1]
    if (last?.role !== 'user') return null
    return (
        last.parts
            ?.filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join(' ') ||
        last.content ||
        ''
    )
}

/**
 * Cap the conversation history sent to the model past N turns (issue #807) —
 * without this a long-running conversation is unbounded token cost. Simple
 * and deterministic: the most recent `limit` messages, no summarization.
 *
 * Only for what goes to the MODEL. Callers must keep using the untrimmed
 * `messages` array for persistence and for anything that reads the
 * transcript as evidence — e.g. `verifyLessonCompletion` — so capping
 * context here never starves that of what it needs.
 */
export function capChatHistory<T>(messages: T[], limit: number): T[] {
    return messages.length > limit ? messages.slice(-limit) : messages
}

interface TenantOwnedRow {
    course?: { tenant_id?: string } | { tenant_id?: string }[] | null
}

function rowTenantId(row: TenantOwnedRow | null): string | undefined {
    const course = row?.course
    if (Array.isArray(course)) return course[0]?.tenant_id
    return course?.tenant_id
}

/**
 * Fetch a lesson scoped to the given tenant via its course.
 * Returns null when the lesson does not exist OR belongs to another tenant.
 */
export async function fetchTenantLesson<T extends TenantOwnedRow>(
    supabase: SupabaseClient,
    lessonId: number,
    tenantId: string,
    select: string
): Promise<T | null> {
    const { data, error } = await supabase
        .from('lessons')
        .select(select)
        .eq('id', lessonId)
        .maybeSingle()

    const row = data as T | null
    if (error || !row || rowTenantId(row) !== tenantId) return null
    return row
}

/**
 * Fetch an exercise scoped to the given tenant via its course.
 * Returns null when the exercise does not exist OR belongs to another tenant.
 */
export async function fetchTenantExercise<T extends TenantOwnedRow>(
    supabase: SupabaseClient,
    exerciseId: number,
    tenantId: string,
    select: string
): Promise<T | null> {
    const { data, error } = await supabase
        .from('exercises')
        .select(select)
        .eq('id', exerciseId)
        .maybeSingle()

    const row = data as T | null
    if (error || !row || rowTenantId(row) !== tenantId) return null
    return row
}
