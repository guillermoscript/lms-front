import { z } from 'zod'
import { openConversationSession } from '@/lib/exercises/realtime-session'
import { buildConversationInstructions } from '@/lib/speech/conversation'

const bodySchema = z.object({ sdp: z.string().trim().min(1).max(64_000) })

/**
 * GPT-Live over WebRTC (`api.session` of `experimental_useRealtime`). The hook
 * POSTs `{ sdp, sessionConfig }`; the browser's `sessionConfig` is ignored —
 * instructions and voice come from `exercise_config`, and the data channel the
 * browser may use is fixed server-side. The audio itself travels as WebRTC
 * media, which is what lets the browser cancel the tutor's voice from the mic.
 */
export async function POST(req: Request) {
  const body = bodySchema.safeParse(await req.clone().json().catch(() => null))
  if (!body.success) return new Response('An SDP offer is required', { status: 400 })

  return openConversationSession(req, async ({ exercise, config, realtime, voice }) => {
    if (!realtime.supportsLive) return new Response('Live voice is not available for this school’s provider', { status: 409 })
    const answer = await realtime.createLiveSession({
      sdp: body.data.sdp,
      instructions: buildConversationInstructions(exercise, config, { live: true }),
      // Live has its own voice list; ours are the shared OpenAI names.
      ...(voice === 'marin' || voice === 'cedar' ? { voice } : {}),
    })
    return Response.json(answer, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  })
}
