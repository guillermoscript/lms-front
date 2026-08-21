import { createClient } from '@/lib/supabase/server'
import { AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { convertToModelMessages, streamText, type UIMessage } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { sanitizeLastUserAttachments } from '@/lib/ai/attachments'

export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { instructions: task_description, system_prompt, messages } = await req.json()

  // Stream Response (Preview mode: no tools, no database saves)
  const modelMessages = await convertToModelMessages(sanitizeLastUserAttachments(messages as UIMessage[]))
  const result = propagateAttributes(
    { userId: user.id },
    () => streamText({
      model: AI_MODELS.tutor,
      system: PROMPTS.previewLesson(task_description, system_prompt),
      messages: modelMessages,
      experimental_telemetry: { functionId: 'preview-lesson-task' },
    }),
  )

  return result.toUIMessageStreamResponse()
}
