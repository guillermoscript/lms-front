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

    const body = await req.json()
    console.log('Received request body:', JSON.stringify(body, null, 2))

    const { messages, lessonId } = body
    if (!lessonId) return new Response('Lesson ID is required', { status: 400 })

    // 1. Fetch lesson details and validate tenant
    const { data: lesson, error } = await supabase
        .from('lessons')
        .select('title, description, content, course_id, lessons_ai_tasks(task_instructions, system_prompt), course:courses!inner(tenant_id)')
        .eq('id', lessonId)
        .single()

    if (error || !lesson || (lesson as any).course?.tenant_id !== tenantId) return new Response('Lesson not found', { status: 404 })

    // Handle both array and object response from Supabase (one-to-one relationship)
    const aiTask = Array.isArray(lesson.lessons_ai_tasks) 
        ? lesson.lessons_ai_tasks?.[0]
        : lesson.lessons_ai_tasks

    // 2. Save user message
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'user') {
        // Handle AI SDK message format with parts
        const messageText = lastMessage.parts
            ?.filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join(' ') || lastMessage.content || ''
            
        if (messageText) {
            await supabase.from('lessons_ai_task_messages').insert({
                lesson_id: lessonId,
                user_id: user.id,
                sender: 'user',
                message: messageText,
            })
        }
    }

    // 3. Stream Response
    const result = streamText({
        model: AI_MODELS.tutor,
        system: PROMPTS.lessonTutor(lesson, aiTask),
        messages: await convertToModelMessages(messages),
        tools: createAITools(supabase, { lessonId, userId: user.id, courseId: lesson.course_id }),
        onFinish: async (event) => {
            const messageData: any = {
                lesson_id: lessonId,
                user_id: user.id,
                sender: 'assistant',
                message: event.text,
            };
            
            // Only add tool_invocations if the column exists (check schema)
            // For now, skip it as the column doesn't exist in the current schema
            
            await supabase.from('lessons_ai_task_messages').insert(messageData)
        },
        stopWhen: stepCountIs(AI_CONFIG.maxSteps),
    })

    return result.toUIMessageStreamResponse()
}
