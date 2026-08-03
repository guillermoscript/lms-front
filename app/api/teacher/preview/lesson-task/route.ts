import { createClient } from '@/lib/supabase/server'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { convertToModelMessages, streamText } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'

export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { instructions: task_description, system_prompt, messages } = await req.json()

  // Stream Response (Preview mode: no tools, no database saves)
  const modelMessages = await convertToModelMessages(messages)
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
