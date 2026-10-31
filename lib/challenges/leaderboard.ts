import type { RankingEntry } from '@/lib/challenges/ranking'

export const LEADERBOARD_TOP_N = 10

/**
 * Top N plus, when the viewer ranks below the cut, their own row, so the
 * leaderboard stays short and the viewer still sees their position. Entries
 * keep their official rank; nothing is re-sorted.
 */
export function trimLeaderboard(entries: RankingEntry[], viewerId?: string | null, topN = LEADERBOARD_TOP_N): RankingEntry[] {
  const top = entries.slice(0, topN)
  if (!viewerId || top.some((e) => e.userId === viewerId)) return top
  const mine = entries.find((e) => e.userId === viewerId)
  return mine ? [...top, mine] : top
}
