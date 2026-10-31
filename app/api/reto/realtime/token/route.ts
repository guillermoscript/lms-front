import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPlanFeature } from '@/lib/plans/server'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import { aiFailureResponse } from '@/lib/exercises/ai-failure'
import { createTenantAi, type TenantRealtime } from '@/lib/ai/tenant-ai'
import { voicesFor } from '@/lib/ai/providers'
import { CONVERSATION_TOOLS, buildConversationInstructions, parseConversationConfig } from '@/lib/speech/conversation'
import { loadChallengesEnabled } from '@/lib/challenges/links'
import { isVoiceChallengeType } from '@/lib/challenges/types'
import { isActiveMember } from '@/lib/challenges/view-data'
import { discardVoiceSession, isValidTab, openVoiceSession } from '@/lib/challenges/voice-session'

/**
 * Setup endpoint for `experimental_useRealtime` on a VOICE reto (the hook POSTs
 * here on `connect()` and expects `{ token, url, tools, provider, model, voice }`).
 *
 * Same shape as `/api/exercises/realtime/token`, with the access rule of a reto:
 * the link is the access (no course entitlement), but the caller must be an
 * ACTIVE MEMBER of the host school. Guests never get a token: each session is
 * billed per minute to the school's BYOK key and the guest caps only count
 * graded attempts. Query: `token` (the reto link) and `tab`.
 */
export async function POST(req: Request) {
  const requestHeaders = await headers()
  const hostTenantId = requestHeaders.get('x-tenant-id')
  if (!hostTenantId) return new Response('Not found', { status: 404 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Sign in to play this challenge', { status: 401 })
  if (!(await isActiveMember(hostTenantId, user.id))) return new Response('Only members can play voice challenges', { status: 403 })

  const params = new URL(req.url).searchParams
  const linkToken = params.get('token') ?? ''
  const tab = params.get('tab')
  if (!linkToken || linkToken.length > 200 || !isValidTab(tab)) return new Response('token and tab are required', { status: 400 })

  const admin = createAdminClient()
  const { data: link } = await admin
    .from('challenge_links')
    .select('exercise_id, tenant_id, active')
    .eq('token', linkToken)
    .maybeSingle()
  // A link only works on its own school's host; never reveal it exists elsewhere.
  if (!link || !link.active || link.tenant_id !== hostTenantId) return new Response('Not found', { status: 404 })
  if (!(await loadChallengesEnabled(admin, hostTenantId))) return new Response('Not found', { status: 404 })

  const { data: stored } = await admin
    .from('exercises')
    .select(`id, title, instructions, system_prompt, exercise_type, exercise_config, status, is_challengeable, ${GRADING_SECRETS_EMBED}`)
    .eq('id', link.exercise_id)
    .eq('tenant_id', hostTenantId)
    .maybeSingle()
  const exercise = stored ? withGradingSecrets(stored) : null
  if (!exercise || exercise.status !== 'published' || exercise.is_challengeable !== true || !isVoiceChallengeType(exercise.exercise_type as string)) {
    return new Response('Not found', { status: 404 })
  }

  // The tenant's key pays for the call and for the grade.
  if (!(await hasPlanFeature(hostTenantId, 'ai_grading'))) return new Response('Challenges are not included in this school’s plan', { status: 403 })
  if (!(await hasPlanFeature(hostTenantId, 'voice_exercises'))) return new Response('Voice exercises are not included in this school’s plan', { status: 403 })

  const config = parseConversationConfig(exercise.exercise_config)

  // Resolve the school's key BEFORE any row is written: a missing or rejected key costs the member nothing.
  const ai = createTenantAi(hostTenantId, { actorId: user.id })
  const aiFailure = (err: unknown) =>
    aiFailureResponse(
      err,
      { feature: 'voice_conversation', canConfigure: false, tenantId: hostTenantId, providerId: ai.lastProviderId(), actorId: user.id },
      () => new Response('Could not start the conversation', { status: 502 })
    )
  let realtime: TenantRealtime
  try {
    realtime = await ai.getRealtime('voice_conversation')
  } catch (err) {
    return aiFailure(err)
  }
  const voice = voicesFor(realtime.providerId).includes(config.voice) ? config.voice : undefined

  const key = { tenantId: hostTenantId, userId: user.id, exerciseId: link.exercise_id as number, tab }
  const opened = await openVoiceSession(admin, key, exercise.exercise_config)
  if (!opened.ok) {
    return opened.reason === 'rate_limited'
      ? new Response('Too many voice challenges this hour', { status: 429 })
      : new Response('Could not start the conversation', { status: 500 })
  }

  try {
    const minted = await realtime.getToken(
      {
        instructions: buildConversationInstructions(exercise, config),
        ...(voice ? { voice } : {}),
        outputModalities: ['audio'],
        inputAudioTranscription: { language: config.target_language },
        turnDetection: { type: 'semantic-vad' },
        tools: CONVERSATION_TOOLS,
      },
      { expiresAfterSeconds: 60 }
    )
    return Response.json(
      { token: minted.token, url: minted.url, tools: CONVERSATION_TOOLS, provider: minted.provider, model: minted.model, voice: minted.voice },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    await discardVoiceSession(admin, hostTenantId, user.id, opened.sessionId)
    return aiFailure(err)
  }
}
