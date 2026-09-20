import type { DbClient, DbResult } from '../client'

/**
 * Leagues (#394) and the review-due count the daily digest is built from (#397),
 * for a client that has no server of its own (#821, guillermoscript/lms-app#12).
 *
 * Neither needs the `get-gamification-summary` edge function: the standings RPC
 * is granted to `authenticated` and scopes itself with `auth.uid()` +
 * `get_tenant_id()`, and `review_cards` is own-row under RLS. Both run on the
 * caller's own token.
 */

export interface LeagueStanding {
  user_id: string
  full_name: string | null
  avatar_url: string | null
  weekly_xp: number
  rank: number
  is_me: boolean
}

/** What `get_league_standings()` answers. `in_league: false` carries only `reason`. */
export type LeagueStandings =
  | { in_league: false; reason: 'no_league' | 'opted_out' }
  | {
      in_league: true
      reason: null
      /** ISO dates. `week_end` is exclusive — the rollover happens at its midnight UTC. */
      week_start: string
      week_end: string
      tier: { tier: number; slug: string; name: string; max_tier: number }
      /** How many of the cohort's top move up / bottom move down at rollover. */
      promote_count: number
      demote_count: number
      cohort_size: number
      standings: LeagueStanding[]
    }

export function getLeagueStandings(supabase: DbClient): DbResult<LeagueStandings> {
  return supabase.rpc('get_league_standings')
}

/**
 * Cards due now — the same predicate `get_daily_digest_candidates` counts with,
 * so the number in the app is the number the nudge was sent about.
 */
export function getDueReviewCount(
  supabase: DbClient,
  userId: string,
  tenantId: string
): PromiseLike<{ count: number | null; error: { message: string } | null }> {
  return supabase
    .from('review_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('suspended', false)
    .lte('due_at', new Date().toISOString())
}
