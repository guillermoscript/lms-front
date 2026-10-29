import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createTenantAi, type ResolvedFeatureModel } from '@/lib/ai/tenant-ai'
import { aiFailureResponse } from '@/lib/exercises/ai-failure'
import { hasPlanFeature } from '@/lib/plans/server'
import { getClientIp } from '@/lib/rate-limit'
import { gradeChallengeAnswer } from '@/lib/challenges/grade'
import { MAX_ANSWER_CHARS, submitChallengeAttempt, type AttemptRefusal } from '@/lib/challenges/attempt'
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE, hashWithSecret, newGuestToken } from '@/lib/challenges/identity'

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
}

/**
 * Public, cold AI grading of one challenge answer (#1027). Guest or member.
 * Separate from `/api/exercises/evaluate`, which stays authenticated.
 * Body: `{ token, answer }`. The score is never taken from the request.
 */
export async function POST(req: Request) {
  const hostTenantId = (await headers()).get('x-tenant-id')
  if (!hostTenantId) return Response.json({ error: 'not_found' }, { status: 404 })

  let token: string
  let answer: string
  try {
    const body = await req.json()
    token = body.token
    answer = body.answer
    if (typeof token !== 'string' || !token || token.length > 200) throw new Error('token')
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('answer')
  } catch {
    return Response.json({ error: 'token and answer are required' }, { status: 400 })
  }
  if (answer.length > MAX_ANSWER_CHARS) return Response.json({ error: 'answer_too_long' }, { status: 413 })

  // Identity: a signed-in member counts as themself, everyone else by guest cookie.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  let guestToken = cookieStore.get(GUEST_COOKIE)?.value
  const issueCookie = !user && !guestToken
  if (issueCookie) guestToken = newGuestToken()

  const identity = {
    userId: user?.id ?? null,
    guestTokenHash: !user && guestToken ? hashWithSecret('guest', guestToken) : null,
    ipHash: hashWithSecret('ip', getClientIp(req)),
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
        admin: createAdminClient(),
        hostTenantId,
        hasAiGrading: (tenantId) => hasPlanFeature(tenantId, 'ai_grading'),
        grade: async (exercise, text) => {
          grader ??= await ai.getModelForFeature('exercise_grader')
          return gradeChallengeAnswer(exercise, text, grader.model)
        },
      },
      { token, answer },
      identity
    )
  } catch (err) {
    return aiFailure(err)
  }

  if (!outcome.ok) {
    return Response.json({ error: outcome.refusal }, { status: REFUSAL_STATUS[outcome.refusal] })
  }

  const response = Response.json(outcome.result)
  if (issueCookie && guestToken) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    response.headers.append(
      'Set-Cookie',
      `${GUEST_COOKIE}=${guestToken}; Path=/; Max-Age=${GUEST_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`
    )
  }
  return response
}
