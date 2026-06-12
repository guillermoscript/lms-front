import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { createExerciseTools } from '@/lib/ai/tools'
import { fetchTenantExercise, lastUserMessageText } from '@/lib/ai/chat-helpers'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { z } from 'zod'

export const maxDuration = 120

const bodySchema = z.object({
    messages: z.array(z.any()),
    exerciseId: z.coerce.number().int().positive(),
})

interface ExerciseRow {
    title: string
    description?: string
    instructions: string
    system_prompt?: string
    course_id: number
    exercise_type?: string
    course: { tenant_id: string } | { tenant_id: string }[] | null
}

export async function POST(req: Request) {
    const auth = await getApiAuthContext(req)
    if (!auth) return new Response('Unauthorized', { status: 401 })
    const { supabase, user, tenantId } = auth

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return new Response('Invalid request body', { status: 400 })
    const { messages, exerciseId } = parsed.data

    // 1. Fetch exercise details and validate tenant
    const exercise = await fetchTenantExercise<ExerciseRow>(
        supabase,
        exerciseId,
        tenantId,
        'title, description, instructions, system_prompt, course_id, exercise_type, course:courses!inner(tenant_id)'
    )

    if (!exercise) return new Response('Exercise not found', { status: 404 })

    // 2. Save user message
    const messageText = lastUserMessageText(messages)
    if (messageText) {
        // exercise_messages has NO tenant_id column — sending it silently fails the insert.
        await supabase.from('exercise_messages').insert({
            exercise_id: exerciseId,
            user_id: user.id,
            role: 'user',
            message: messageText,
        })
    }

    // 3. Stream Response
    const result = streamText({
        model: AI_MODELS.coach,
        system: PROMPTS.exerciseCoach(exercise),
        messages: await convertToModelMessages(messages),
        tools: createExerciseTools(supabase, { exerciseId: String(exerciseId), userId: user.id, tenantId, exerciseType: exercise.exercise_type }),
        experimental_telemetry: { isEnabled: true, functionId: 'exercise-coach', metadata: { exerciseId: String(exerciseId), userId: user.id, tenantId } },
        onFinish: async (event) => {
            const { error } = await supabase.from('exercise_messages').insert({
                exercise_id: exerciseId,
                user_id: user.id,
                role: 'assistant',
                message: event.text,
            })
            if (error) console.error('Failed to persist exercise assistant message:', error)
        },
        stopWhen: stepCountIs(AI_CONFIG.maxSteps),
    })

    return result.toUIMessageStreamResponse()
}
