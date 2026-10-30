import { createAdminClient } from '@/lib/supabase/admin'
import { formatDisplayName, type RankingEntry } from './ranking'

/**
 * Server-only ranking for pages that guests can see (admin client, RLS
 * bypassed). Official, claimed attempts of ACTIVE members of ONE tenant; no emails.
 * Order: score desc, earliest first, id as final tiebreak (same as the RPC).
 * Callers must have validated that `tenantId` is the host tenant.
 */
export async function getChallengeRankingServer(
  tenantId: string,
  exerciseId: number,
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<RankingEntry[]> {
  const { data: attempts, error } = await admin
    .from('challenge_attempts')
    .select('id, user_id, score, passed, created_at')
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exerciseId)
    .eq('is_official', true)
    .not('user_id', 'is', null)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  if (!attempts?.length) return []

  const candidateIds = [...new Set(attempts.map((a) => a.user_id as string))]
  // Only ACTIVE members of this tenant rank (never a non-member or banned user).
  const { data: members, error: mErr } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('user_id', candidateIds)
  if (mErr) throw new Error(mErr.message)
  const active = new Set((members ?? []).map((m) => m.user_id as string))
  const userIds = candidateIds.filter((id) => active.has(id))
  if (!userIds.length) return []
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  if (pErr) throw new Error(pErr.message)
  const names = new Map((profiles ?? []).map((p) => [p.id, formatDisplayName(p.full_name)]))

  return attempts
    .filter((a) => active.has(a.user_id as string))
    .map((a, i) => ({
    rank: i + 1,
    userId: a.user_id as string,
    displayName: names.get(a.user_id as string) ?? '',
    score: a.score,
    passed: a.passed,
    createdAt: a.created_at,
  }))
}
