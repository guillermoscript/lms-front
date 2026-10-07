import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { AI_CONFIG } from '@/lib/ai/config'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { aiErrorBody, classifyProviderError, markCredentialInvalid } from '@/lib/ai/errors'
import { buildCourseArchitectPrompt } from '@/lib/ai/course-architect-prompt'
import {
    architectToolApproval,
    canUseCourseArchitect,
    jwtTenantId,
    openArchitectTools,
} from '@/lib/ai/course-architect-tools'
import { capChatHistory } from '@/lib/ai/chat-helpers'
import { sanitizeLastUserAttachments } from '@/lib/ai/attachments'
import { AI_CHAT_TURNS_PER_MINUTE, aiChatLimiter } from '@/lib/rate-limit'
import { aiChatRateLimitedResponse, aiChatUsageLimitResponse, checkAiChatUsage } from '@/lib/ai/chat-usage'
import { convertToModelMessages, stepCountIs, streamText, type ToolSet } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { z } from 'zod'

export const maxDuration = 300

const id = z.coerce.number().int().positive()

const scopeSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('new') }),
    z.object({ type: z.literal('course'), courseId: id }),
    z.object({ type: z.literal('lesson'), lessonId: id, courseId: id.optional() }),
    z.object({ type: z.literal('exercise'), exerciseId: id, courseId: id.optional() }),
    z.object({ type: z.literal('exam'), examId: id, courseId: id.optional() }),
])

const bodySchema = z.object({
    messages: z.array(z.any()),
    scope: scopeSchema.default({ type: 'new' }),
    locale: z.enum(['en', 'es']).default('en'),
})

export async function POST(req: Request) {
    // 1. auth
    const auth = await getApiAuthContext(req)
    if (!auth) return new Response('Unauthorized', { status: 401 })
    const { supabase, user, tenantId } = auth

    // 2. role gate. tenant_users is authoritative, queried with the verified user id:
    // the x-user-id header (what getUserRole() reads) is not reliably forwarded to route handlers.
    const { data: membership } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .maybeSingle()
    const role = membership?.role
    if (!canUseCourseArchitect(role)) return new Response('Forbidden', { status: 403 })

    return withTenantAi({ tenantId, feature: 'course_architect', canConfigure: role === 'admin', actorId: user.id }, async (ai) => {
        // 3. resolve the school's model BEFORE the rate limiter, the usage increment and the
        // MCP connection. The architect is a tool-calling agent loop (up to
        // courseArchitectMaxSteps) on the school's own bill, so a model without tool support
        // is refused here (422 ai_model_unsupported) instead of failing mid-conversation.
        const { model, providerId, modelId } = await ai.getModelForFeature('course_architect', { require: ['tools'] })

        // 4. rate limit and usage
        try {
            await aiChatLimiter.check(AI_CHAT_TURNS_PER_MINUTE, user.id)
        } catch {
            return aiChatRateLimitedResponse()
        }

        const parsed = bodySchema.safeParse(await req.json().catch(() => null))
        if (!parsed.success) return new Response('Invalid request body', { status: 400 })
        const { messages: rawMessages, scope, locale } = parsed.data
        const messages = sanitizeLastUserAttachments(rawMessages)

        const { data: { session } } = await supabase.auth.getSession()
        const accessToken = session?.access_token
        if (!accessToken) return new Response('Unauthorized', { status: 401 })
        // The MCP server acts in the token's tenant; never author in a different school than the one being viewed.
        if (jwtTenantId(accessToken) !== tenantId) {
            return new Response('Session belongs to a different school. Reload and try again.', { status: 409 })
        }

        const usage = await checkAiChatUsage(supabase, tenantId, user.id)
        if (!usage.allowed) return aiChatUsageLimitResponse(usage.reason)

        // 5. side effects: open the MCP tool connection
        let mcp: Awaited<ReturnType<typeof openArchitectTools>>
        try {
            mcp = await openArchitectTools(accessToken, role)
        } catch (error) {
            console.error('Course architect: MCP connection failed', error instanceof Error ? error.name : typeof error)
            return new Response('Authoring tools are unavailable', { status: 503 })
        }

        const tools = mcp.tools as ToolSet

        let closed = false
        const closeMcp = async () => {
            if (closed) return
            closed = true
            await mcp.close().catch(() => {})
        }

        try {
            const system = buildCourseArchitectPrompt({ scope, locale, role })
            const modelMessages = await convertToModelMessages(capChatHistory(messages, AI_CONFIG.maxHistoryMessages), { tools })

            const result = propagateAttributes(
                { userId: user.id, metadata: { tenantId, scope: scope.type, feature: 'course_architect', provider: providerId, modelId } },
                () => streamText({
                    model,
                    system,
                    messages: modelMessages,
                    tools,
                    toolApproval: architectToolApproval(role),
                    // Signs approval requests so a client cannot forge an approval for a risky call.
                    experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY,
                    experimental_telemetry: { functionId: 'course-architect' },
                    stopWhen: stepCountIs(AI_CONFIG.courseArchitectMaxSteps),
                    abortSignal: req.signal,
                    onFinish: closeMcp,
                    onError: async ({ error }) => {
                        // Name and status only: provider errors can echo request details.
                        console.error('Course architect stream error:', error instanceof Error ? error.name : typeof error)
                        // The headers are already sent, so a rejected key is recorded here
                        // (the stream's own error part carries the typed code to the client).
                        const err = classifyProviderError(error, { feature: 'course_architect', providerId })
                        if (err.code === 'ai_key_invalid') {
                            await markCredentialInvalid(tenantId, providerId, 'course_architect', user.id)
                        }
                        await closeMcp()
                    },
                    onAbort: closeMcp,
                }),
            )

            // A failure mid-stream cannot change the HTTP status, so it travels as the stream's
            // error text: the same JSON body the pre-stream errors use, which `parseAiChatError`
            // (useChat onError) turns back into the right copy. Never the raw provider message.
            return result.toUIMessageStreamResponse({
                onError: (error) =>
                    JSON.stringify(
                        aiErrorBody(classifyProviderError(error, { feature: 'course_architect', providerId }), {
                            feature: 'course_architect',
                            canConfigure: role === 'admin',
                        }),
                    ),
            })
        } catch (error) {
            await closeMcp()
            throw error
        }
    })
}
