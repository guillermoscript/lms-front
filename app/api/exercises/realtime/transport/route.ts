import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { createTenantAi } from '@/lib/ai/tenant-ai'

/**
 * Which connection the browser should open for a voice call: `webrtc` (GPT-Live,
 * native barge-in + echo cancellation) when the school's realtime provider is
 * OpenAI, else the provider WebSocket. Resolves the school's key but mints
 * nothing and writes nothing, so a failure here simply means "websocket" and
 * the real error surfaces from the setup route.
 */
export async function GET(req: Request) {
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  let live = false
  try {
    live = (await createTenantAi(auth.tenantId, { actorId: auth.user.id }).getRealtime('voice_conversation')).supportsLive
  } catch {
    live = false
  }
  return Response.json({ transport: live ? 'webrtc' : 'websocket' }, { headers: { 'Cache-Control': 'no-store' } })
}
