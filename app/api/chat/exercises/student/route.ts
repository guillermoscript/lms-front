import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { AI_CONFIG } from '@/lib/ai/config'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { reportStreamError } from '@/lib/ai/errors'
import { canConfigureAi } from '@/lib/exercises/ai-failure'
import { PROMPTS } from '@/lib/ai/prompts'
import { createExerciseTools } from '@/lib/ai/tools'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchGradingSecrets } from '@/lib/exercises/grading-secrets'
import { capChatHistory, fetchTenantExercise, lastUserMessageText } from '@/lib/ai/chat-helpers'
import { persistLastUserAttachments, sanitizeLastUserAttachments } from '@/lib/ai/attachments'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { z } from 'zod'
import { AI_CHAT_TURNS_PER_MINUTE, aiChatLimiter } from '@/lib/rate-limit'
import { checkAiChatUsage, aiChatRateLimitedResponse, aiChatUsageLimitResponse } from '@/lib/ai/chat-usage'

export const maxDuration = 120

const bodySchema = z.object({
    messages: z.array(z.any()),
    exerciseId: z.coerce.number().int().positive(),
})

interface ExerciseRow {
    title: string
    description?: string
    instructions: string
    course_id: number
    exercise_type?: string
    course: { tenant_id: string } | { tenant_id: string }[] | null
}

/** Does the newest user message carry an image? Only then does the model need vision. */
function lastUserHasImage(messages: { role?: string; parts?: { type?: string; mediaType?: string }[] }[]): boolean {
    const last = messages[messages.length - 1]
    if (last?.role !== 'user') return false
    return !!last.parts?.some((part) => part.type === 'file' && part.mediaType?.startsWith('image/'))
}

export async function POST(req: Request) {
    // 1. auth
    const auth = await getApiAuthContext(req)
    if (!auth) return new Response('Unauthorized', { status: 401 })
    const { supabase, user, tenantId } = auth

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return new Response('Invalid request body', { status: 400 })
    const { messages: rawMessages, exerciseId } = parsed.data
    // Body is user-controlled: drop non-image / oversized file parts before they reach the model.
    const messages = sanitizeLastUserAttachments(rawMessages)

    // 2. access: RLS-scoped read + explicit tenant check. A 404 never costs a budget slot.
    const exercise = await fetchTenantExercise<ExerciseRow>(
        supabase,
        exerciseId,
        tenantId,
        'title, description, instructions, course_id, exercise_type, course:courses!inner(tenant_id)'
    )

    if (!exercise) return new Response('Exercise not found', { status: 404 })

    // 3. role: only decides the error copy (admins get the settings link), so it
    // is looked up lazily, on the error path only.
    const canConfigure = () => canConfigureAi(supabase, user.id, tenantId)

    return withTenantAi({ tenantId, feature: 'exercise_coach', canConfigure, actorId: user.id }, async (ai) => {
        // 4. resolve the school's model BEFORE any rate-limit slot, usage
        // increment or row write: no key = no side effects.
        const coach = await ai.getModelForFeature('exercise_coach', {
            require: lastUserHasImage(messages) ? ['vision'] : undefined,
        })

        // 5. rate limit and usage
        try {
            await aiChatLimiter.check(AI_CHAT_TURNS_PER_MINUTE, user.id)
        } catch {
            return aiChatRateLimitedResponse()
        }
        const usage = await checkAiChatUsage(supabase, tenantId, user.id)
        if (!usage.allowed) return aiChatUsageLimitResponse(usage.reason)

        // The teacher's prompt is staff-only (#833); the student's own read above
        // established access, so the admin client fetches it for the coach.
        const secrets = await fetchGradingSecrets(createAdminClient(), exerciseId)
        const systemPrompt = secrets?.system_prompt ?? undefined

        // 6. side effects: save user message
        const messageText = lastUserMessageText(messages)
        const attachments = await persistLastUserAttachments(messages, {
            tenantId, userId: user.id, kind: 'exercise', referenceId: exerciseId,
        })
        if (messageText || attachments.length > 0) {
            // exercise_messages has NO tenant_id column — sending it silently fails the insert.
            await supabase.from('exercise_messages').insert({
                exercise_id: exerciseId,
                user_id: user.id,
                role: 'user',
                message: messageText ?? '',
                attachments: attachments.length > 0 ? attachments : null,
            })
        }

        // 7. Stream Response
        const modelMessages = await convertToModelMessages(capChatHistory(messages, AI_CONFIG.maxHistoryMessages))
        const result = propagateAttributes(
            {
                userId: user.id,
                metadata: {
                    exerciseId: String(exerciseId),
                    tenantId,
                    feature: 'exercise_coach',
                    provider: coach.providerId,
                    modelId: coach.modelId,
                },
            },
            () => streamText({
                model: coach.model,
                system: PROMPTS.exerciseCoach({ ...exercise, system_prompt: systemPrompt }),
                messages: modelMessages,
                tools: createExerciseTools(supabase, { exerciseId: String(exerciseId), userId: user.id, tenantId, exerciseType: exercise.exercise_type }),
                experimental_telemetry: { functionId: 'exercise-coach' },
                onFinish: async (event) => {
                    const { error } = await supabase.from('exercise_messages').insert({
                        exercise_id: exerciseId,
                        user_id: user.id,
                        role: 'assistant',
                        message: event.text,
                    })
                    if (error) console.error('Failed to persist exercise assistant message:', error)
                },
                onError: ({ error }) =>
                    reportStreamError(error, { feature: 'exercise_coach', tenantId, userId: user.id, providerId: coach.providerId }),
                stopWhen: stepCountIs(AI_CONFIG.maxSteps),
            }),
        )

        return result.toUIMessageStreamResponse()
    })
}
