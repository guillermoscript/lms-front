import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getChallengeRankingServer } from './ranking-server'
import { loadChallengeCourse, type ChallengeCourse } from './course-context'
import { loadViewerAttempt } from './viewer-attempt'
import { trimLeaderboard } from './leaderboard'
import type { RankingEntry } from './ranking'
import { GUEST_COOKIE, hashWithSecret, isChallengeSecretConfigured, verifyGuestToken } from './identity'

/** Rows sent to the client; the viewer's own row is always kept. */
export const LEADERBOARD_MAX_ROWS = 100

/** Only an ACTIVE member plays as themself and can share; a bare session is a guest. */
export async function isActiveMember(tenantId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false
  const { data } = await createAdminClient()
    .from('tenant_users')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.status === 'active'
}

export interface ChallengeViewData {
  course: ChallengeCourse | null
  rankingEntries?: RankingEntry[]
  played: { score: number; passed: boolean; answer: string; feedback: unknown; rank: number | null } | null
}

/**
 * Loaders shared by `/reto/<token>` and the dashboard route, so both mount the
 * same data. A ranking/course failure never takes the page down.
 */
export async function loadChallengeView(opts: {
  tenantId: string
  exerciseId: number
  userId: string | null
  viewerIsMember: boolean
}): Promise<ChallengeViewData> {
  const { tenantId, exerciseId, userId, viewerIsMember } = opts
  const [rankingAll, course] = await Promise.all([
    getChallengeRankingServer(tenantId, exerciseId).catch(() => undefined),
    loadChallengeCourse(tenantId, exerciseId).catch(() => null),
  ])
  // Same identity rule as the attempt route: an ACTIVE member plays as themself, anyone else by guest cookie.
  let guestTokenHash: string | null = null
  if (!viewerIsMember && isChallengeSecretConfigured()) {
    const presented = (await cookies()).get(GUEST_COOKIE)?.value
    if (verifyGuestToken(presented)) guestTokenHash = hashWithSecret('guest', presented)
  }
  const played = await loadViewerAttempt(createAdminClient(), tenantId, exerciseId, {
    userId: viewerIsMember ? userId : null,
    guestTokenHash,
  }).catch(() => null)
  const rank = played && viewerIsMember ? (rankingAll?.find((e) => e.userId === userId)?.rank ?? null) : null
  return {
    course,
    rankingEntries: rankingAll ? trimLeaderboard(rankingAll, userId, LEADERBOARD_MAX_ROWS) : undefined,
    played: played ? { score: played.score, passed: played.passed, answer: played.answer, feedback: played.feedback, rank } : null,
  }
}
