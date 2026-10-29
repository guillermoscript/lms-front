import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/** Scores closer than this many points are a technical tie (duel only). */
export const TIE_BAND_POINTS = 3

export interface RankingEntry {
  rank: number
  userId: string
  /** First name + last initial. May be empty: the UI substitutes a translated label. */
  displayName: string
  score: number
  passed: boolean
  createdAt: string
}

/**
 * First name + last initial ("Ana Pérez López" -> "Ana L."). Same rule as the
 * SQL in get_challenge_ranking(). Returns '' when there is no name.
 */
export function formatDisplayName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const initial = Array.from(parts[parts.length - 1])[0]?.toUpperCase()
  return `${parts[0]} ${initial}.`
}

/**
 * Logged-in (member) path: the RPC is SECURITY DEFINER, restricted to
 * `authenticated` active members of the exercise's tenant, and already
 * ordered (score desc, created_at asc, id). Not callable by guests: public
 * pages use `getChallengeRankingServer` (lib/challenges/ranking-server.ts).
 */
export async function fetchChallengeRanking(
  supabase: SupabaseClient<Database>,
  exerciseId: number,
): Promise<RankingEntry[]> {
  const { data, error } = await supabase.rpc('get_challenge_ranking', {
    _exercise_id: exerciseId,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id,
    displayName: r.display_name,
    score: r.score,
    passed: r.passed,
    createdAt: r.created_at,
  }))
}

export type DuelOutcome = 'mine' | 'theirs' | 'tie'

export interface DuelResult {
  outcome: DuelOutcome
  /** Absolute point difference. */
  diff: number
}

/**
 * Head-to-head: a difference under TIE_BAND_POINTS is a tie ("Empate técnico").
 * Deliberate: the ranking itself orders by exact score; only the duel uses the band.
 */
export function compareDuel(mine: number, theirs: number): DuelResult {
  const diff = Math.abs(mine - theirs)
  if (diff < TIE_BAND_POINTS) return { outcome: 'tie', diff }
  return { outcome: mine > theirs ? 'mine' : 'theirs', diff }
}
