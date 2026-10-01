/**
 * XP for community participation (#874). The database awards it — triggers in
 * supabase/migrations/20260929160000_community_xp_874.sql apply the amounts,
 * daily caps (UTC day) and once-per-reference rules. The web only reads back
 * what an insert earned, to show a "+N XP" toast; it never awards.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Every community XP action type (community_xp_rule() is the registry). */
export const COMMUNITY_XP_ACTIONS = [
  'community_prompt_answer',
  'community_post',
  'community_comment',
  'community_helpful_received',
  'community_answer_accepted',
  'community_prompt_graded',
] as const
export type CommunityXpAction = (typeof COMMUNITY_XP_ACTIONS)[number]

export type CommunityXpEarned = { amount: number; action: CommunityXpAction | null }

type XpRow = { action_type: string; xp_amount: number; created_at: string | null }

/**
 * What one insert earned, from the XP rows found for its references. The award
 * runs in the insert's own transaction, so its rows carry the same `now()` as
 * the inserted row's `created_at`; older rows on the same reference (a prompt
 * already answered before a delete + repost) are earlier and ignored.
 */
export function communityXpEarned(rows: XpRow[], since: string): CommunityXpEarned {
  const sinceMs = Date.parse(since)
  let amount = 0
  let action: CommunityXpAction | null = null
  for (const row of rows) {
    if (!(COMMUNITY_XP_ACTIONS as readonly string[]).includes(row.action_type)) continue
    if (!row.created_at || Date.parse(row.created_at) < sinceMs) continue
    amount += row.xp_amount
    // The biggest award names the toast (a prompt answer over anything else).
    if (!action || row.action_type === 'community_prompt_answer') action = row.action_type as CommunityXpAction
  }
  return { amount, action: amount > 0 ? action : null }
}

/** Read back the XP a just-inserted post/comment earned for its author. */
export async function readCommunityXpEarned(
  client: SupabaseClient,
  opts: { userId: string; tenantId: string; referenceIds: string[]; since: string }
): Promise<CommunityXpEarned> {
  const { data, error } = await client
    .from('gamification_xp_transactions')
    .select('action_type, xp_amount, created_at')
    .eq('user_id', opts.userId)
    .eq('tenant_id', opts.tenantId)
    .in('action_type', [...COMMUNITY_XP_ACTIONS])
    .in('reference_id', opts.referenceIds)
  if (error || !data) return { amount: 0, action: null }
  return communityXpEarned(data, opts.since)
}
