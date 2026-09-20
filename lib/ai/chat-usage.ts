import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Durable per-user-daily / per-tenant-monthly AI chat budget (issue #807).
 *
 * Layers UNDER the in-memory `aiChatLimiter` burst brake in lib/rate-limit.ts
 * — call that FIRST (cheap, no DB round trip) and only reach this on a pass,
 * since it costs a transaction with two advisory locks. This is the part that
 * survives a deploy: caps come from `platform_plans.limits` via
 * `increment_ai_chat_usage()` (migration 20260920170000), which checks and
 * increments atomically so two concurrent requests cannot both slip past a
 * cap. `-1` or a missing limit key means unlimited, same rule as every other
 * plan limit.
 */
export type AiChatUsageCheck =
    | { allowed: true }
    | { allowed: false; reason: 'daily_limit' | 'monthly_limit' }

export async function checkAiChatUsage(
    supabase: SupabaseClient,
    tenantId: string,
    userId: string
): Promise<AiChatUsageCheck> {
    const { data, error } = await supabase.rpc('increment_ai_chat_usage', {
        _tenant_id: tenantId,
        _user_id: userId,
    })

    if (error) {
        // Fail OPEN: a DB hiccup must not take the tutor down for everyone —
        // the in-memory limiter in front of this call is still there to
        // catch a genuine runaway script.
        console.error('increment_ai_chat_usage failed:', error)
        return { allowed: true }
    }

    const result = data as { allowed?: boolean; reason?: string } | null
    if (!result || result.allowed) return { allowed: true }
    return { allowed: false, reason: result.reason === 'monthly_limit' ? 'monthly_limit' : 'daily_limit' }
}

/**
 * Both 429 responses below are JSON, not plain text: `DefaultChatTransport`
 * (ai-sdk) surfaces a non-ok response's `response.text()` verbatim as
 * `Error.message` in `useChat`'s `onError` / `error`. `lib/ai/chat-error.ts`
 * parses that back out client-side to show the right friendly copy instead
 * of the generic error state.
 */
export function aiChatRateLimitedResponse(): Response {
    return new Response(JSON.stringify({ code: 'ai_chat_rate_limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
    })
}

export function aiChatUsageLimitResponse(reason: 'daily_limit' | 'monthly_limit'): Response {
    return new Response(JSON.stringify({ code: 'ai_chat_usage_limit', scope: reason }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
    })
}
