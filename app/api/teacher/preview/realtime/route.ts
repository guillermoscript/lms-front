import { z } from 'zod'
import { authorizeExercisePreview, checkExercisePreviewBudget } from '@/lib/exercises/preview-auth'
import { aiFailureResponse } from '@/lib/exercises/ai-failure'
import { hasPlanFeature } from '@/lib/plans/server'
import { createTenantAi, type TenantRealtime } from '@/lib/ai/tenant-ai'
import { voicesFor } from '@/lib/ai/providers'
import { CONVERSATION_VOICES, CONVERSATION_LANGUAGES, CONVERSATION_TOOLS } from '@/lib/speech/conversation'

const schema = z.object({ sessionConfig: z.object({
  instructions: z.string().trim().min(1).max(80_000),
  voice: z.enum(CONVERSATION_VOICES),
  inputAudioTranscription: z.object({ language: z.enum(CONVERSATION_LANGUAGES) }),
}) })

/**
 * Teacher-authored session instructions are accepted only after staff/course
 * authorization. The school's own realtime key mints the token (BYOK) and is
 * resolved before the preview budget is spent; the response carries
 * `{ provider, model, voice }` so the client builds its model from it.
 */
export async function POST(req: Request) {
  const courseId = Number(new URL(req.url).searchParams.get('courseId'))
  if (!Number.isInteger(courseId) || courseId <= 0) return Response.json({ error: 'Invalid course' }, { status: 400 })
  const auth = await authorizeExercisePreview(req, courseId)
  if (auth instanceof Response) return auth
  if (!(await hasPlanFeature(auth.tenantId, 'voice_exercises'))) return Response.json({ error: 'Voice exercises are not included in this school’s plan' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid session configuration' }, { status: 400 })

  const ai = createTenantAi(auth.tenantId, { actorId: auth.user.id })
  const aiFailure = (err: unknown) => aiFailureResponse(
    err,
    { feature: 'voice_conversation', canConfigure: auth.canConfigure, tenantId: auth.tenantId, providerId: ai.lastProviderId(), actorId: auth.user.id },
    () => Response.json({ error: 'Could not start the conversation' }, { status: 502 }),
  )
  let realtime: TenantRealtime
  try {
    realtime = await ai.getRealtime('voice_conversation')
  } catch (error) {
    return aiFailure(error)
  }

  const denied = await checkExercisePreviewBudget(auth)
  if (denied) return denied
  // The builder offers OpenAI voice names; another provider falls back to the school's voice.
  const { voice, ...sessionConfig } = parsed.data.sessionConfig
  try {
    const minted = await realtime.getToken(
      {
        ...sessionConfig,
        ...(voicesFor(realtime.providerId).includes(voice) ? { voice } : {}),
        outputModalities: ['audio'],
        turnDetection: { type: 'semantic-vad' },
        tools: CONVERSATION_TOOLS,
      },
      { expiresAfterSeconds: 60 },
    )
    return Response.json(
      { token: minted.token, url: minted.url, tools: CONVERSATION_TOOLS, provider: minted.provider, model: minted.model, voice: minted.voice },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return aiFailure(error)
  }
}
