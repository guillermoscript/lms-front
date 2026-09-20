import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AI_CONFIG, AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { createPreviewExerciseTools } from '@/lib/ai/tools'
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { sanitizeLastUserAttachments } from '@/lib/ai/attachments'
import { z } from 'zod'
import { AI_CHAT_TURNS_PER_MINUTE, aiChatLimiter } from '@/lib/rate-limit'

export const maxDuration = 120

// The builder sends its unsaved draft, so the teacher tests what they are typing.
const bodySchema = z.object({
  messages: z.array(z.any()),
  instructions: z.string().optional(),
  system_prompt: z.string().optional(),
  exercise: z
    .object({ title: z.string().optional(), description: z.string().optional() })
    .optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  try {
    await aiChatLimiter.check(AI_CHAT_TURNS_PER_MINUTE, user.id)
  } catch {
    return new Response('Too many messages. Wait a moment and try again.', { status: 429 })
  }

  // The system prompt comes from the request body: for anyone but staff this
  // route would be an open-ended model proxy. tenant_users is the authoritative
  // role source (x-user-id does not reach route handlers).
  const tenantId = await getCurrentTenantId()
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  if (membership?.role !== 'teacher' && membership?.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response('Invalid request body', { status: 400 })
  const { messages, instructions, system_prompt, exercise } = parsed.data

  // Preview mode: the student's prompt and tool, but the tool is a dry run and nothing is saved.
  const modelMessages = await convertToModelMessages(sanitizeLastUserAttachments(messages as UIMessage[]))
  const result = propagateAttributes(
    { userId: user.id },
    () => streamText({
      model: AI_MODELS.coach,
      system: PROMPTS.exerciseCoach({
        title: exercise?.title || '',
        description: exercise?.description,
        instructions: instructions || '',
        system_prompt: system_prompt || undefined,
      }),
      messages: modelMessages,
      tools: createPreviewExerciseTools(),
      experimental_telemetry: { functionId: 'preview-exercise' },
      stopWhen: stepCountIs(AI_CONFIG.maxSteps),
    }),
  )

  return result.toUIMessageStreamResponse()
}
