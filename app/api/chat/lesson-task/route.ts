import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { createLessonTools } from '@/lib/ai/tools'
import { verifyLessonCompletion } from '@/lib/ai/lesson-completion-verifier'
import { parseStructuredRequirements, requirementIds } from '@/lib/ai/lesson-requirements'
import { AI_CHAT_TURNS_PER_MINUTE, aiChatLimiter } from '@/lib/rate-limit'
import { fetchTenantLesson, lastUserMessageText } from '@/lib/ai/chat-helpers'
import { persistLastUserAttachments, sanitizeLastUserAttachments } from '@/lib/ai/attachments'
import { LESSON_TASK_TOOL_INVOCATION_VERSION } from '@/lib/ai/lesson-task-history'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { z } from 'zod'

export const maxDuration = 120

const bodySchema = z.object({
    messages: z.array(z.any()),
    lessonId: z.coerce.number().int().positive(),
})

interface LessonAITaskRow {
    task_instructions?: string
    system_prompt?: string
    requirements?: unknown
}

interface LessonRow {
    title: string
    description?: string
    content?: string
    course_id: number
    lessons_ai_tasks: LessonAITaskRow | LessonAITaskRow[] | null
    course: { tenant_id: string } | { tenant_id: string }[] | null
}

export async function POST(req: Request) {
    const auth = await getApiAuthContext(req)
    if (!auth) return new Response('Unauthorized', { status: 401 })
    const { supabase, user, tenantId } = auth

    try {
        await aiChatLimiter.check(AI_CHAT_TURNS_PER_MINUTE, user.id)
    } catch {
        return new Response('Too many messages. Wait a moment and try again.', { status: 429 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return new Response('Invalid request body', { status: 400 })
    const { messages: rawMessages, lessonId } = parsed.data
    // Body is user-controlled: drop non-image / oversized file parts before they reach the model.
    const messages = sanitizeLastUserAttachments(rawMessages)

    // 1. Fetch lesson details and validate tenant
    const lesson = await fetchTenantLesson<LessonRow>(
        supabase,
        lessonId,
        tenantId,
        'title, description, content, course_id, lessons_ai_tasks(task_instructions, system_prompt, requirements), course:courses!inner(tenant_id)'
    )

    if (!lesson) return new Response('Lesson not found', { status: 404 })

    // Handle both array and object response from Supabase (one-to-one relationship)
    const aiTaskRow = (Array.isArray(lesson.lessons_ai_tasks)
        ? lesson.lessons_ai_tasks?.[0]
        : lesson.lessons_ai_tasks) ?? undefined

    // NULL/invalid `requirements` falls back to the free-text task below (#806
    // compatibility contract) — never a 500 on a row from before this shipped.
    const structuredRequirements = parseStructuredRequirements(aiTaskRow?.requirements)
    const aiTask = aiTaskRow ? { ...aiTaskRow, requirements: structuredRequirements } : undefined

    // 2. Save user message
    const messageText = lastUserMessageText(messages)
    const attachments = await persistLastUserAttachments(messages, {
        tenantId, userId: user.id, kind: 'lesson', referenceId: lessonId,
    })
    if (messageText || attachments.length > 0) {
        // lessons_ai_task_messages has NO tenant_id column — sending it silently fails the insert.
        await supabase.from('lessons_ai_task_messages').insert({
            lesson_id: lessonId,
            user_id: user.id,
            sender: 'user',
            message: messageText ?? '',
            attachments: attachments.length > 0 ? attachments : null,
        })
    }

    // 3. Stream Response
    const modelMessages = await convertToModelMessages(messages)
    const result = propagateAttributes(
        { userId: user.id, metadata: { lessonId: String(lessonId), tenantId } },
        () => streamText({
        model: AI_MODELS.tutor,
        system: PROMPTS.lessonTutor(lesson, aiTask),
        messages: modelMessages,
        tools: createLessonTools(supabase, {
            lessonId: String(lessonId),
            userId: user.id,
            requirementIds: requirementIds(structuredRequirements),
            verify: () => verifyLessonCompletion({
                taskInstructions: aiTask?.task_instructions,
                teacherPrompt: aiTask?.system_prompt,
                structuredRequirements,
                messages,
            }),
        }),
        experimental_telemetry: { functionId: 'lesson-tutor' },
        onFinish: async (event) => {
            // lessons_ai_task_messages has NO tenant_id column — sending it silently fails the insert.
            // `event.text` is the LAST step only. The tutor congratulates and calls
            // markLessonCompleted in one step, then closes in the next — keep both.
            //
            // The markLessonCompleted call (and its verdict) rides along in
            // tool_invocations so a reload can rebuild the "Target achieved"
            // card and a teacher can see why it was granted (#805) — this is
            // the only write path for this row, extending it rather than
            // adding a second insert.
            // Two tools (markLessonCompleted + reportProgress, #806) make
            // `step.toolResults` a union of per-tool arrays, and TS widens the
            // callback parameter across that union — so narrow the shape we
            // actually read before filtering.
            type LessonToolResult = {
                toolName: string
                toolCallId: string
                input: unknown
                output: unknown
            }

            const toolInvocations = event.steps.flatMap((step) =>
                (step.toolResults as LessonToolResult[])
                    .filter((result) => result.toolName === 'markLessonCompleted')
                    .map((result) => ({
                        version: LESSON_TASK_TOOL_INVOCATION_VERSION,
                        toolName: result.toolName,
                        toolCallId: result.toolCallId,
                        input: result.input,
                        output: result.output,
                    }))
            )

            const messageData = {
                lesson_id: lessonId,
                user_id: user.id,
                sender: 'assistant',
                message: event.steps.map((step) => step.text).filter(Boolean).join('\n\n'),
                tool_invocations: toolInvocations.length > 0 ? toolInvocations : null,
            };

            const { error } = await supabase.from('lessons_ai_task_messages').insert(messageData)
            if (error) console.error('Failed to persist lesson assistant message:', error)
        },
        stopWhen: stepCountIs(AI_CONFIG.maxSteps),
        }),
    )

    return result.toUIMessageStreamResponse()
}
