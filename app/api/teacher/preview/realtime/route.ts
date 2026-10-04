import { z } from 'zod'
import { openai } from '@ai-sdk/openai'
import { authorizeExercisePreview, checkExercisePreviewBudget } from '@/lib/exercises/preview-auth'
import { hasPlanFeature } from '@/lib/plans/server'
import { CONVERSATION_VOICES, CONVERSATION_LANGUAGES, CONVERSATION_TOOLS, REALTIME_MODEL } from '@/lib/speech/conversation'

const schema = z.object({ sessionConfig: z.object({
  instructions: z.string().trim().min(1).max(80_000),
  voice: z.enum(CONVERSATION_VOICES),
  inputAudioTranscription: z.object({ language: z.enum(CONVERSATION_LANGUAGES) }),
}) })

/** Teacher-authored session instructions are accepted only after staff/course authorization. */
export async function POST(req: Request) {
  const courseId = Number(new URL(req.url).searchParams.get('courseId'))
  if (!Number.isInteger(courseId) || courseId <= 0) return Response.json({ error: 'Invalid course' }, { status: 400 })
  const auth = await authorizeExercisePreview(req, courseId)
  if (auth instanceof Response) return auth
  if (!(await hasPlanFeature(auth.tenantId, 'voice_exercises'))) return Response.json({ error: 'Voice exercises are not included in this school’s plan' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid session configuration' }, { status: 400 })
  const denied = await checkExercisePreviewBudget(auth)
  if (denied) return denied
  try {
    const { token, url } = await openai.experimental_realtime.getToken({ model: REALTIME_MODEL, expiresAfterSeconds: 60,
      sessionConfig: { ...parsed.data.sessionConfig, outputModalities: ['audio'], turnDetection: { type: 'semantic-vad' }, tools: CONVERSATION_TOOLS },
    })
    return Response.json({ token, url, tools: CONVERSATION_TOOLS })
  } catch (error) {
    console.error('Teacher voice preview failed:', error)
    return Response.json({ error: 'Could not start the conversation' }, { status: 502 })
  }
}
