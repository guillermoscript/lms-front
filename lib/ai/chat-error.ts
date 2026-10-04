/**
 * Classify a `useChat` error against the JSON bodies `lib/ai/chat-usage.ts`
 * returns for a 429, so chat surfaces can show a friendly, specific message
 * instead of the generic error state (issue #807).
 *
 * `DefaultChatTransport` (ai-sdk) sets `Error.message` to the raw response
 * text of a non-ok fetch, so a structured 429 body round-trips here as JSON;
 * anything else (network failure, a 500, a plain-text body) falls through to
 * 'generic'.
 */
export type AiChatErrorKind = 'burst' | 'daily' | 'monthly' | 'generic'

export function classifyAiChatError(error: unknown): AiChatErrorKind {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
    if (!message) return 'generic'

    try {
        const parsed = JSON.parse(message) as { code?: string; scope?: string }
        if (parsed.code === 'ai_chat_rate_limited') return 'burst'
        if (parsed.code === 'ai_chat_usage_limit') {
            return parsed.scope === 'monthly_limit' ? 'monthly' : 'daily'
        }
    } catch {
        // Not our structured body.
    }
    return 'generic'
}
