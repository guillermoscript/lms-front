import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createTenantAi, type ResolvedFeatureModel } from '@/lib/ai/tenant-ai'
import { aiFailureResponse } from '@/lib/exercises/ai-failure'
import { hasPlanFeature } from '@/lib/plans/server'
import { gradeChallengeAnswer, transcriptToText } from '@/lib/challenges/grade'
import { claimVoiceSession, isValidTab, settleVoiceSession } from '@/lib/challenges/voice-session'
import { ConversationTranscriptSchema } from '@/lib/speech/conversation'
import { materializeChallengeAttempt } from '@/lib/challenges/materialize'
import { notifyChallengeBeaten } from '@/lib/challenges/beaten'
import { MAX_ANSWER_CHARS, submitChallengeAttempt, type AttemptRefusal, type VoiceSubmission } from '@/lib/challenges/attempt'
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  hashWithSecret,
  isChallengeSecretConfigured,
  newGuestToken,
  trustedClientIp,
  verifyGuestToken,
} from '@/lib/challenges/identity'

export const maxDuration = 120

const REFUSAL_STATUS: Record<AttemptRefusal, number> = {
  link_not_found: 404,
  tenant_mismatch: 404,
  link_inactive: 404,
  challenges_disabled: 404,
  exercise_unavailable: 404,
  plan_feature_required: 403,
  rate_limited: 429,
  paused: 503,
  in_progress: 429,
  members_only: 403,
  invalid_submission: 400,
  no_session: 409,
  session_too_long: 410,
  invalid_transcript: 422,
}

/**
 * Public, cold AI grading of one challenge answer (#1027). Guest or member.
 * Separate from `/api/exercises/evaluate`, which stays authenticated.
 * Body: `{ token, answer }` for text retos, or `{ token, tab, transcript }` for a
 * voice reto (members only; the transcript must come from a session the token
 * route opened). The score is never taken from the request.
 */
export async function POST(req: Request) {
  if (!isChallengeSecretConfigured()) return Response.json({ error: 'not_configured' }, { status: 503 })
  const requestHeaders = await headers()
  const hostTenantId = requestHeaders.get('x-tenant-id')
  if (!hostTenantId) return Response.json({ error: 'not_found' }, { status: 404 })

  let token: string
  let answer: string
  let voice: VoiceSubmission | undefined
  try {
    const body = await req.json()
    token = body.token
    if (typeof token !== 'string' || !token || token.length > 200) throw new Error('token')
    if (body.transcript !== undefined) {
      if (!isValidTab(body.tab)) throw new Error('tab')
      voice = { tab: body.tab, turns: ConversationTranscriptSchema.parse(body.transcript) }
      answer = transcriptToText(voice.turns)
    } else {
      answer = body.answer
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('answer')
    }
  } catch {
    return Response.json({ error: 'token and answer (or tab and transcript) are required' }, { status: 400 })
  }
  if (answer.length > MAX_ANSWER_CHARS) return Response.json({ error: 'answer_too_long' }, { status: 413 })

  // Identity: an active member counts as themself, everyone else by guest cookie.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  // Only a token this server signed is trusted; anything else gets a fresh one.
  const presented = cookieStore.get(GUEST_COOKIE)?.value
  let guestToken = verifyGuestToken(presented) ? presented : undefined
  // A session alone is not membership: only an ACTIVE member of the host school
  // plays as themself. Non-members and banned users play as guests, so the
  // claim flow can join them later and they never reach the ranking unjoined.
  const admin = createAdminClient()
  let member = false
  if (user) {
    const { data: membership } = await admin
      .from('tenant_users')
      .select('status')
      .eq('tenant_id', hostTenantId)
      .eq('user_id', user.id)
      .maybeSingle()
    member = membership?.status === 'active'
  }
  const issueCookie = !member && !guestToken
  if (issueCookie) guestToken = newGuestToken()
  const withCookie = (response: Response) => {
    if (issueCookie && guestToken) {
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
      response.headers.append(
        'Set-Cookie',
        `${GUEST_COOKIE}=${guestToken}; Path=/; Max-Age=${GUEST_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`
      )
    }
    return response
  }

  const identity = {
    userId: member && user ? user.id : null,
    guestTokenHash: !member && guestToken ? hashWithSecret('guest', guestToken) : null,
    ipHash: hashWithSecret('ip', trustedClientIp(requestHeaders)),
  }

  const ai = createTenantAi(hostTenantId, { actorId: user?.id })
  let grader: ResolvedFeatureModel | null = null
  const aiFailure = (err: unknown) =>
    aiFailureResponse(
      err,
      { feature: 'exercise_grader', canConfigure: false, tenantId: hostTenantId, providerId: ai.lastProviderId(), actorId: user?.id },
      () => Response.json({ error: 'grading_failed' }, { status: 500 })
    )

  let outcome
  try {
    outcome = await submitChallengeAttempt(
      {
        admin,
        hostTenantId,
        hasAiGrading: (tenantId) => hasPlanFeature(tenantId, 'ai_grading'),
        materialize: (input) => materializeChallengeAttempt(admin, input),
        onOfficialAttempt: (input) => notifyChallengeBeaten({ admin, ...input }),
        voice: {
          claim: ({ turns, exerciseConfig, ...key }) => claimVoiceSession(admin, key, exerciseConfig, turns),
          settle: ({ tenantId, sessionId, status }) => settleVoiceSession(admin, tenantId, sessionId, status),
        },
        grade: async (exercise, text) => {
          grader ??= await ai.getModelForFeature('exercise_grader')
          return gradeChallengeAnswer(exercise, text, grader.model)
        },
      },
      { token, answer, voice },
      identity
    )
  } catch (err) {
    return withCookie(await aiFailure(err))
  }

  if (!outcome.ok) {
    return withCookie(Response.json({ error: outcome.refusal }, { status: REFUSAL_STATUS[outcome.refusal] }))
  }

  return withCookie(Response.json(outcome.result))
}
