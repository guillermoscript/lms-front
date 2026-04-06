import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { createAITools } from '@/lib/ai/tools'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'

export const maxDuration = 120

export async function POST(req: Request) {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return new Response('Unauthorized', { status: 401 })

    const { messages, exerciseId } = await req.json()
    if (!exerciseId) return new Response('Exercise ID is required', { status: 400 })

    // 1. Fetch exercise details and validate tenant
    const { data: exercise, error } = await supabase
        .from('exercises')
        .select('title, description, instructions, system_prompt, course_id, exercise_type, course:courses!inner(tenant_id)')
        .eq('id', exerciseId)
        .single()

    if (error || !exercise || (exercise as any).course?.tenant_id !== tenantId) return new Response('Exercise not found', { status: 404 })

    // 2. Save user message
    const lastUserMessage = messages[messages.length - 1]
    if (lastUserMessage?.role === 'user') {
        await supabase.from('exercise_messages').insert({
            exercise_id: exerciseId,
            user_id: user.id,
            role: 'user',
            message: lastUserMessage.content,
            tenant_id: tenantId,
        })
    }

    // 3. Stream Response
    const result = streamText({
        model: AI_MODELS.coach,
        system: PROMPTS.exerciseCoach(exercise),
        messages: await convertToModelMessages(messages),
        tools: createAITools(supabase, { exerciseId, userId: user.id, tenantId, exerciseType: (exercise as any).exercise_type }),
        experimental_telemetry: { isEnabled: true, functionId: 'exercise-coach', metadata: { exerciseId: String(exerciseId), userId: user.id, tenantId } },
        onFinish: async (event) => {
            await supabase.from('exercise_messages').insert({
                exercise_id: exerciseId,
                user_id: user.id,
                role: 'assistant',
                message: event.text,
                tenant_id: tenantId,
            })
        },
        stopWhen: stepCountIs(AI_CONFIG.maxSteps),
    })

    return result.toUIMessageStreamResponse()
}
