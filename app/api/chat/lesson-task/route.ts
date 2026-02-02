import { createClient } from '@/lib/supabase/server'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { createAITools } from '@/lib/ai/tools'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'

export const maxDuration = AI_CONFIG.maxDuration

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return new Response('Unauthorized', { status: 401 })

    const { messages, lessonId } = await req.json()
    if (!lessonId) return new Response('Lesson ID is required', { status: 400 })

    // 1. Fetch lesson details
    const { data: lesson, error } = await supabase
        .from('lessons')
        .select('title, description, content, course_id, lessons_ai_tasks(task_description, ai_instructions)')
        .eq('id', lessonId)
        .single()

    if (error || !lesson) return new Response('Lesson not found', { status: 404 })

    const aiTask = lesson.lessons_ai_tasks?.[0]

    // 2. Save user message
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'user') {
        await supabase.from('lessons_ai_task_messages').insert({
            lesson_id: lessonId,
            user_id: user.id,
            role: 'user',
            content: lastMessage.content,
        })
    }

    // 3. Stream Response
    const result = streamText({
        model: AI_MODELS.tutor,
        system: PROMPTS.lessonTutor(lesson, aiTask),
        messages: await convertToModelMessages(messages),
        tools: createAITools(supabase, { lessonId, userId: user.id, courseId: lesson.course_id }),
        onFinish: async (event) => {
            await supabase.from('lessons_ai_task_messages').insert({
                lesson_id: lessonId,
                user_id: user.id,
                role: 'assistant',
                content: event.text,
                tool_invocations: event.toolCalls as any,
            })
        },
        stopWhen: stepCountIs(AI_CONFIG.maxSteps),
    })

    return result.toUIMessageStreamResponse()
}
