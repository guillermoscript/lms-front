import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/** Scores closer than this many points are a technical tie. */
export const TIE_BAND_POINTS = 3

export interface RankingEntry {
  rank: number
  userId: string
  displayName: string
  score: number
  passed: boolean
  createdAt: string
}

/**
 * First name + last initial ("Ana Pérez López" -> "Ana L."). Mirrors the
 * SQL in get_challenge_ranking(); used for any name the client formats itself.
 */
export function formatDisplayName(fullName: string | null | undefined, fallback = 'Estudiante'): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return fallback
  if (parts.length === 1) return parts[0]
  const initial = Array.from(parts[parts.length - 1])[0]?.toUpperCase()
  return `${parts[0]} ${initial}.`
}

/** Score desc, then earliest attempt first. Re-numbers ranks 1..n. */
export function sortRanking(entries: Omit<RankingEntry, 'rank'>[]): RankingEntry[] {
  return [...entries]
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((e, i) => ({ ...e, rank: i + 1 }))
}

/**
 * Per-exercise ranking for the caller's tenant. Tenant scoping is enforced by
 * the SECURITY DEFINER RPC (caller must be an active member of the exercise's
 * tenant and only that tenant's official, claimed attempts are returned).
 */
export async function fetchChallengeRanking(
  supabase: SupabaseClient<Database>,
  exerciseId: number,
): Promise<RankingEntry[]> {
  const { data, error } = await supabase.rpc('get_challenge_ranking', {
    _exercise_id: exerciseId,
  })
  if (error) throw new Error(error.message)
  return sortRanking(
    (data ?? []).map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      score: r.score,
      passed: r.passed,
      createdAt: r.created_at,
    })),
  )
}

export type DuelOutcome = 'mine' | 'theirs' | 'tie'

export interface DuelResult {
  outcome: DuelOutcome
  /** Absolute point difference. */
  diff: number
}

/** Difference under TIE_BAND_POINTS is a tie ("Empate técnico"); otherwise the higher score wins. */
export function compareDuel(mine: number, theirs: number): DuelResult {
  const diff = Math.abs(mine - theirs)
  if (diff < TIE_BAND_POINTS) return { outcome: 'tie', diff }
  return { outcome: mine > theirs ? 'mine' : 'theirs', diff }
}
