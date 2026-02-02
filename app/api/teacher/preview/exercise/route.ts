import { createClient } from '@/lib/supabase/server'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'

export const maxDuration = AI_CONFIG.maxDuration

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { instructions, system_prompt, messages } = await req.json()

  // Stream Response (Preview mode: no tools, no database saves)
  const result = streamText({
    model: AI_MODELS.coach,
    system: PROMPTS.previewExercise(instructions, system_prompt),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(AI_CONFIG.maxSteps),
  })

  return result.toUIMessageStreamResponse()
}
