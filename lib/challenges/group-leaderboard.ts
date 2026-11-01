import { TIE_BAND_POINTS } from '@/lib/challenges/ranking'

/**
 * Group leaderboard maths (epic #1049, #1050). Pure: callers load the members
 * and the official attempts; nothing here touches the database.
 *
 * - Every challenge yields a 0-100 score (the official attempt on the exercise).
 * - Leaderboard = average of the scores a person has + challenges won.
 * - A challenge is won by the top score, and needs at least TWO players. Players
 *   within TIE_BAND_POINTS (#1025) of the top share the win ("empate técnico").
 * - Ranking: average desc, wins desc, challenges played desc, then label.
 *   People who have not played anything are listed last, unranked.
 */

export interface GroupParticipant {
  /** Stable key: the user id, or `guest:<n>` for an unclaimed guest (never a hash). */
  key: string
  /** First name + initial; `null` = unclaimed guest (UI shows "Invitado"); '' = no name. */
  label: string | null
  isMe?: boolean
}

export interface GroupScore {
  participantKey: string
  exerciseId: number
  score: number
}

export interface GroupLeaderboardRow extends GroupParticipant {
  /** 1-based, ties on (average, wins, played) share a rank; null when nothing was played. */
  rank: number | null
  average: number | null
  played: number
  won: number
}

/** Winners of one challenge: keys within the tie band of the top score. Empty below two players. */
export function challengeWinners(scores: { participantKey: string; score: number }[]): string[] {
  if (scores.length < 2) return []
  const top = Math.max(...scores.map((s) => s.score))
  return scores.filter((s) => top - s.score < TIE_BAND_POINTS).map((s) => s.participantKey)
}

export function buildGroupLeaderboard(
  participants: GroupParticipant[],
  scores: GroupScore[],
  exerciseIds: number[],
): GroupLeaderboardRow[] {
  const allowed = new Set(exerciseIds)
  const known = new Set(participants.map((p) => p.key))
  // One score per participant per exercise (the first one wins if duplicated).
  const byExercise = new Map<number, Map<string, number>>()
  for (const s of scores) {
    if (!allowed.has(s.exerciseId) || !known.has(s.participantKey)) continue
    const m = byExercise.get(s.exerciseId) ?? new Map<string, number>()
    if (!m.has(s.participantKey)) m.set(s.participantKey, s.score)
    byExercise.set(s.exerciseId, m)
  }

  const totals = new Map<string, { sum: number; played: number; won: number }>()
  for (const p of participants) totals.set(p.key, { sum: 0, played: 0, won: 0 })
  for (const [, m] of byExercise) {
    const list = [...m].map(([participantKey, score]) => ({ participantKey, score }))
    for (const { participantKey, score } of list) {
      const t = totals.get(participantKey)!
      t.sum += score
      t.played += 1
    }
    for (const key of challengeWinners(list)) totals.get(key)!.won += 1
  }

  const rows = participants.map((p) => {
    const t = totals.get(p.key)!
    return { ...p, average: t.played ? Math.round(t.sum / t.played) : null, played: t.played, won: t.won, rank: null as number | null }
  })
  const label = (r: { label: string | null }) => r.label ?? '￿'
  rows.sort(
    (a, b) =>
      Number(b.played > 0) - Number(a.played > 0) ||
      (b.average ?? 0) - (a.average ?? 0) ||
      b.won - a.won ||
      b.played - a.played ||
      label(a).localeCompare(label(b)) ||
      a.key.localeCompare(b.key),
  )
  let prev: (typeof rows)[number] | null = null
  let rank = 0
  rows.forEach((r, i) => {
    if (r.played === 0) return
    if (!prev || prev.average !== r.average || prev.won !== r.won || prev.played !== r.played) rank = i + 1
    r.rank = rank
    prev = r
  })
  return rows
}

export interface ChallengeTableAttempt {
  participantKey: string
  exerciseId: number
  score: number
  criteria: { id: string; met: boolean }[]
}

export interface ChallengeTableRow {
  exerciseId: number
  played: { key: string; label: string | null; score: number; won: boolean; isMe: boolean }[]
  /** Active members who have not played yet (guests are never "pending"). */
  pending: { key: string; label: string | null; isMe: boolean }[]
  myScore: number | null
  /**
   * Per-criterion comparison. Criteria are numbered, never described: the
   * rubric text is grading material and stays server-side. Only people who
   * played appear; the viewer must have played to see it.
   */
  criteria: { id: string; byParticipant: { key: string; label: string | null; isMe: boolean; met: boolean | null }[] }[]
}

/** Per-challenge table: who played (best first), who is pending, and the criterion comparison. */
export function buildChallengeTable(
  participants: GroupParticipant[],
  attempts: ChallengeTableAttempt[],
  exerciseId: number,
): ChallengeTableRow {
  const byKey = new Map(participants.map((p) => [p.key, p]))
  const mine = attempts.filter((a) => a.exerciseId === exerciseId && byKey.has(a.participantKey))
  const seen = new Set<string>()
  const unique = mine.filter((a) => (seen.has(a.participantKey) ? false : (seen.add(a.participantKey), true)))
  const winners = new Set(challengeWinners(unique))
  const played = unique
    .map((a) => {
      const p = byKey.get(a.participantKey)!
      return { key: p.key, label: p.label, score: a.score, won: winners.has(p.key), isMe: Boolean(p.isMe) }
    })
    .sort((a, b) => b.score - a.score || (a.label ?? '￿').localeCompare(b.label ?? '￿'))
  const pending = participants
    .filter((p) => p.label !== null && !seen.has(p.key))
    .map((p) => ({ key: p.key, label: p.label, isMe: Boolean(p.isMe) }))
  const myScore = played.find((p) => p.isMe)?.score ?? null

  const order: string[] = []
  for (const a of unique) for (const c of a.criteria) if (!order.includes(c.id)) order.push(c.id)
  const criteria =
    myScore === null
      ? []
      : order.map((id) => ({
          id,
          byParticipant: played.map((p) => {
            const hit = unique.find((a) => a.participantKey === p.key)?.criteria.find((c) => c.id === id)
            return { key: p.key, label: p.label, isMe: p.isMe, met: hit ? hit.met : null }
          }),
        }))
  return { exerciseId, played, pending, myScore, criteria }
}
