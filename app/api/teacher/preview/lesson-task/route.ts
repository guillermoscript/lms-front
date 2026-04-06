import { createClient } from '@/lib/supabase/server'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { convertToModelMessages, streamText } from 'ai'

export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { instructions: task_description, system_prompt, messages } = await req.json()

  // Stream Response (Preview mode: no tools, no database saves)
  const result = streamText({
    model: AI_MODELS.tutor,
    system: PROMPTS.previewLesson(task_description, system_prompt),
    messages: await convertToModelMessages(messages),
    experimental_telemetry: { isEnabled: true, functionId: 'preview-lesson-task', metadata: { userId: user.id } },
  })

  return result.toUIMessageStreamResponse()
}
