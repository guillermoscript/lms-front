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

/**
 * Row shape of the single `ChallengeLeaderboard` component. `label`: `null` =
 * guest, `''` = member without a name (the component localizes both).
 */
export interface LeaderboardRow {
  key: string
  /** Official rank; defaults to the 1-based position when omitted. */
  rank?: number
  label: string | null
  score: number
  isMe?: boolean
  /** Score difference vs the viewer (viewer - row); omitted when not relevant. */
  delta?: number | null
}

/** Adapts ranking entries (RPC / server helper) to leaderboard rows, marking the viewer. */
export function rankingToRows(entries: RankingEntry[], viewerId?: string | null): LeaderboardRow[] {
  return entries.map((e) => ({
    key: e.userId,
    rank: e.rank,
    label: e.displayName,
    score: e.score,
    isMe: Boolean(viewerId) && e.userId === viewerId,
  }))
}

/** How many neighbours on each side of the viewer the compact ranking shows. */
export const NEIGHBOURS = 3

/** The viewer's row plus up to `n` neighbours each side (the window slides at the edges). */
export function windowAround<T extends { isMe: boolean }>(rows: T[], n = NEIGHBOURS): T[] {
  const size = 2 * n + 1
  const i = rows.findIndex((r) => r.isMe)
  const start = i === -1 ? 0 : Math.max(0, Math.min(i - n, rows.length - size))
  return rows.slice(start, start + size)
}
