import { createAdminClient } from '@/lib/supabase/admin'
import { formatDisplayName, type RankingEntry } from './ranking'

/**
 * Server-only ranking for pages that guests can see (admin client, RLS
 * bypassed). Official, claimed attempts of ONE tenant; no emails.
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

  const userIds = [...new Set(attempts.map((a) => a.user_id as string))]
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  if (pErr) throw new Error(pErr.message)
  const names = new Map((profiles ?? []).map((p) => [p.id, formatDisplayName(p.full_name)]))

  return attempts.map((a, i) => ({
    rank: i + 1,
    userId: a.user_id as string,
    displayName: names.get(a.user_id as string) ?? '',
    score: a.score,
    passed: a.passed,
    createdAt: a.created_at,
  }))
}
