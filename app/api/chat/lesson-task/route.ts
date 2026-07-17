import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { createLessonTools } from '@/lib/ai/tools'
import { fetchTenantLesson, lastUserMessageText } from '@/lib/ai/chat-helpers'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { z } from 'zod'

export const maxDuration = 120

const bodySchema = z.object({
    messages: z.array(z.any()),
    lessonId: z.coerce.number().int().positive(),
})

interface LessonRow {
    title: string
    description?: string
    content?: string
    course_id: number
    lessons_ai_tasks: { task_instructions?: string; system_prompt?: string } | { task_instructions?: string; system_prompt?: string }[] | null
    course: { tenant_id: string } | { tenant_id: string }[] | null
}

export async function POST(req: Request) {
    const auth = await getApiAuthContext(req)
    if (!auth) return new Response('Unauthorized', { status: 401 })
    const { supabase, user, tenantId } = auth

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return new Response('Invalid request body', { status: 400 })
    const { messages, lessonId } = parsed.data

    // 1. Fetch lesson details and validate tenant
    const lesson = await fetchTenantLesson<LessonRow>(
        supabase,
        lessonId,
        tenantId,
        'title, description, content, course_id, lessons_ai_tasks(task_instructions, system_prompt), course:courses!inner(tenant_id)'
    )

    if (!lesson) return new Response('Lesson not found', { status: 404 })

    // Handle both array and object response from Supabase (one-to-one relationship)
    const aiTask = (Array.isArray(lesson.lessons_ai_tasks)
        ? lesson.lessons_ai_tasks?.[0]
        : lesson.lessons_ai_tasks) ?? undefined

    // 2. Save user message
    const messageText = lastUserMessageText(messages)
    if (messageText) {
        // lessons_ai_task_messages has NO tenant_id column — sending it silently fails the insert.
        await supabase.from('lessons_ai_task_messages').insert({
            lesson_id: lessonId,
            user_id: user.id,
            sender: 'user',
            message: messageText,
        })
    }

    // 3. Stream Response
    const result = streamText({
        model: AI_MODELS.tutor,
        system: PROMPTS.lessonTutor(lesson, aiTask),
        messages: await convertToModelMessages(messages),
        tools: createLessonTools(supabase, { lessonId: String(lessonId), userId: user.id }),
        experimental_telemetry: { isEnabled: true, functionId: 'lesson-tutor', metadata: { lessonId: String(lessonId), userId: user.id, tenantId } },
        onFinish: async (event) => {
            // lessons_ai_task_messages has NO tenant_id column — sending it silently fails the insert.
            const messageData: any = {
                lesson_id: lessonId,
                user_id: user.id,
                sender: 'assistant',
                message: event.text,
            };

            const { error } = await supabase.from('lessons_ai_task_messages').insert(messageData)
            if (error) console.error('Failed to persist lesson assistant message:', error)
        },
        stopWhen: stepCountIs(AI_CONFIG.maxSteps),
    })

    return result.toUIMessageStreamResponse()
}
