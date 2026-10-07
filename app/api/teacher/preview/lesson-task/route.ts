import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AI_CONFIG } from '@/lib/ai/config'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { PROMPTS } from '@/lib/ai/prompts'
import { createPreviewLessonTools } from '@/lib/ai/tools'
import { verifyLessonCompletion } from '@/lib/ai/lesson-completion-verifier'
import { requirementIds, structuredRequirementsSchema } from '@/lib/ai/lesson-requirements'
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { lastUserMessageHasAttachments, sanitizeLastUserAttachments } from '@/lib/ai/attachments'
import { capChatHistory } from '@/lib/ai/chat-helpers'
import { z } from 'zod'
import { AI_CHAT_TURNS_PER_MINUTE, aiChatLimiter } from '@/lib/rate-limit'
import { checkAiChatUsage, aiChatRateLimitedResponse, aiChatUsageLimitResponse } from '@/lib/ai/chat-usage'

export const maxDuration = 120

// The editor sends its unsaved draft, so the teacher tests what they are typing.
const bodySchema = z.object({
  messages: z.array(z.any()),
  task_description: z.string().optional(),
  system_prompt: z.string().optional(),
  // Present when the teacher is testing the structured form (#806) — takes
  // over the whole prompt, exactly as the saved row does once `requirements` is set.
  requirements: structuredRequirementsSchema.nullable().optional(),
  lesson: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      content: z.string().optional(),
    })
    .optional(),
})

export async function POST(req: Request) {
  // 1. auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2/3. access + role. The system prompt comes from the request body: for
  // anyone but staff this route would be an open-ended model proxy.
  // tenant_users is the authoritative role source (x-user-id does not reach
  // route handlers, so getUserRole() cannot be used here).
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
  const { messages, task_description, system_prompt, requirements, lesson } = parsed.data
  const structuredRequirements = requirements ?? null
  const safeMessages = sanitizeLastUserAttachments(messages as UIMessage[])

  return withTenantAi(
    { tenantId, feature: 'lesson_tutor', canConfigure: membership.role === 'admin', actorId: user.id },
    async (ai) => {
      // 4. resolve the school's models before the rate limit / usage budget:
      // no key = nothing spent. The preview uses the same feature ids as the
      // student surface, so the teacher tests the model students will get.
      const tutor = await ai.getModelForFeature('lesson_tutor', {
        require: lastUserMessageHasAttachments(safeMessages) ? ['vision'] : undefined,
      })
      const verifier = await ai.getModelForFeature('lesson_verifier')

      // 5. rate limit and usage. A preview turn spends the same tenant/user budget as the real chat.
      try {
        await aiChatLimiter.check(AI_CHAT_TURNS_PER_MINUTE, user.id)
      } catch {
        return aiChatRateLimitedResponse()
      }
      const usage = await checkAiChatUsage(supabase, tenantId, user.id)
      if (!usage.allowed) return aiChatUsageLimitResponse(usage.reason)

      // Preview mode: the student's prompt and tool, but the tool is a dry run and nothing is saved.
      const modelMessages = await convertToModelMessages(capChatHistory(safeMessages, AI_CONFIG.maxHistoryMessages))
      const result = propagateAttributes(
        {
          userId: user.id,
          metadata: {
            tenantId,
            feature: 'lesson_tutor',
            provider: tutor.providerId,
            modelId: tutor.modelId,
          },
        },
        () => streamText({
          model: tutor.model,
          system: PROMPTS.previewLesson(lesson ?? {}, {
            task_instructions: task_description || undefined,
            system_prompt: system_prompt || undefined,
            requirements: structuredRequirements,
          }),
          messages: modelMessages,
          tools: createPreviewLessonTools(
            () => verifyLessonCompletion({
              model: verifier.model,
              taskInstructions: task_description,
              teacherPrompt: system_prompt,
              structuredRequirements,
              messages,
            }),
            requirementIds(structuredRequirements)
          ),
          experimental_telemetry: { functionId: 'preview-lesson-task' },
          stopWhen: stepCountIs(AI_CONFIG.maxSteps),
        }),
      )

      return result.toUIMessageStreamResponse()
    },
  )
}
