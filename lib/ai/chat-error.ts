import { AI_SETTINGS_PATH, isAiErrorCode, type AiErrorCode } from '@/lib/ai/error-codes'

/**
 * Classify a `useChat` error against the JSON bodies the AI routes return, so
 * chat surfaces can show a friendly, specific message instead of the generic
 * error state (issue #807, BYOK).
 *
 * `DefaultChatTransport` (ai-sdk) sets `Error.message` to the raw response
 * text of a non-ok fetch, so a structured body round-trips here as JSON.
 * Two shapes are understood:
 *   - `{ code: 'ai_chat_rate_limited' | 'ai_chat_usage_limit', scope? }`
 *     (429s from `lib/ai/chat-usage.ts`)
 *   - `{ error: { code, feature, canConfigure, settingsUrl } }`
 *     (`aiErrorResponse` in `lib/ai/errors.ts`; code is one of `AiErrorCode`)
 * Anything else (network failure, a 500, a plain-text body) is 'generic'.
 *
 * Client-safe: imports only the code list from `lib/ai/error-codes.ts`, never a
 * server module.
 */
export type AiChatLimitKind = 'burst' | 'daily' | 'monthly'

export type AiChatErrorKind = AiChatLimitKind | AiErrorCode | 'generic'

export interface AiChatErrorInfo {
    kind: AiChatErrorKind
    /** The viewer is a school admin and can fix a setup problem in AI settings. */
    canConfigure: boolean
    /** Where an admin can fix it; null for everyone else. */
    settingsUrl: string | null
}

/** True for the codes that mean "the school's AI setup, not your usage, is the problem". */
export function isAiSetupErrorKind(kind: AiChatErrorKind): kind is AiErrorCode {
    return isAiErrorCode(kind)
}

export function parseAiChatError(error: unknown): AiChatErrorInfo {
    const generic: AiChatErrorInfo = { kind: 'generic', canConfigure: false, settingsUrl: null }
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
    if (!message) return generic

    try {
        const parsed = JSON.parse(message) as {
            code?: string
            scope?: string
            error?: { code?: unknown; canConfigure?: unknown; settingsUrl?: unknown }
        } | null

        if (!parsed || typeof parsed !== 'object') return generic

        if (parsed.code === 'ai_chat_rate_limited') return { ...generic, kind: 'burst' }
        if (parsed.code === 'ai_chat_usage_limit') {
            return { ...generic, kind: parsed.scope === 'monthly_limit' ? 'monthly' : 'daily' }
        }

        const inner = parsed.error
        if (inner && typeof inner === 'object' && isAiErrorCode(inner.code)) {
            const canConfigure = inner.canConfigure === true
            return {
                kind: inner.code,
                canConfigure,
                settingsUrl: canConfigure
                    ? typeof inner.settingsUrl === 'string' && inner.settingsUrl.startsWith('/')
                        ? inner.settingsUrl
                        : AI_SETTINGS_PATH
                    : null,
            }
        }
    } catch {
        // Not our structured body.
    }
    return generic
}

export function classifyAiChatError(error: unknown): AiChatErrorKind {
    return parseAiChatError(error).kind
}
