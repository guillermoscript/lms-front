'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { BANNED_MESSAGE } from '@/lib/tenant/join-school'
import {
  CHALLENGE_GUEST_COOKIE,
  claimChallengeAttempt,
  findNextExercise,
} from '@/lib/challenges/claim'

export type ClaimChallengeOutcome =
  | {
      success: true
      score: number
      passed: boolean
      courseId: number
      /** true only when the free entitlement was actually granted. */
      accessGranted: boolean
      /** Free course: next exercise to open. Paid course: always null. */
      nextExerciseId: number | null
      /** Paid course: show the buy CTA with the score; nothing was granted. */
      requiresPurchase: boolean
    }
  | {
      success: false
      code:
        | 'unauthenticated'
        | 'invalid_link'
        | 'unavailable'
        | 'no_attempt'
        | 'banned'
        | 'not_member'
        | 'claim_failed'
        | 'retry'
      error?: string
    }

/**
 * Post-login claim for `/reto/<token>?claim=1`. Order: membership (the
 * `/join-school` hop already ran; a non-member is told to join, a banned one
 * is refused) → attach the guest attempt → grant a FREE entitlement ONLY when
 * the course is free. A paid course grants nothing, ever.
 */
export async function claimChallenge(linkToken: string): Promise<ClaimChallengeOutcome> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, code: 'unauthenticated' }

  const tenantId = await getCurrentTenantId()
  const admin = createAdminClient()
  const guestToken = (await cookies()).get(CHALLENGE_GUEST_COOKIE)?.value

  const claim = await claimChallengeAttempt({
    admin,
    userId: user.id,
    tenantId,
    linkToken: typeof linkToken === 'string' ? linkToken : '',
    guestToken,
  })
  if (!claim.ok) {
    return {
      success: false,
      code: claim.code,
      error: claim.code === 'banned' ? BANNED_MESSAGE : undefined,
    }
  }

  const base = {
    success: true as const,
    score: claim.attempt.score,
    passed: claim.attempt.passed,
    courseId: claim.courseId,
  }

  // The attempt is claimed either way; access is only ever granted on 'free'.
  // 'unknown' (a pricing query failed) grants nothing and asks to retry.
  if (claim.courseAccess === 'unknown') return { success: false, code: 'retry' }

  if (claim.courseAccess === 'paid') {
    return { ...base, accessGranted: false, nextExerciseId: null, requiresPurchase: true }
  }

  // Free course: grant as the signed-in user via the RPC (it requires
  // auth.uid() = _user_id and an active membership, and re-checks price).
  const { error } = await supabase.rpc('grant_free_entitlement', {
    _user_id: user.id,
    _course_id: claim.courseId,
  })
  if (error) {
    // Revoked access, fee gate, unpublished course...: no access, no leak.
    console.error('grant_free_entitlement failed for challenge claim:', error.message)
    return { ...base, accessGranted: false, nextExerciseId: null, requiresPurchase: false }
  }

  const nextExerciseId = await findNextExercise(admin, tenantId, claim.courseId, claim.exerciseId)
  return { ...base, accessGranted: true, nextExerciseId, requiresPurchase: false }
}
