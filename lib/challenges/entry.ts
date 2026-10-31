import type { createAdminClient } from '@/lib/supabase/admin'
import { CHALLENGEABLE_TYPES, loadChallengesEnabled } from './links'
import { formatDisplayName } from './ranking'
import { NEIGHBOURS, windowAround } from './leaderboard'

/**
 * Read side of the challenge entry points inside the exercise flow (F2): the
 * "challenge a friend" block with a compact ranking on the result screen, and
 * the "Reto" badge + best score on the exercise list. Admin client (challenge
 * tables are server-read only) with an explicit `tenant_id` on every query.
 * Everything is hidden (null / empty) when the school has challenges off.
 * Only safe data leaves: first name + initial, scores and ranks.
 */
type Admin = ReturnType<typeof createAdminClient>

export { NEIGHBOURS, windowAround }

export interface EntryRankRow {
  rank: number
  userId: string
  label: string
  score: number
  isMe: boolean
}

export interface ExerciseEntry {
  myScore: number
  myRank: number
  total: number
  passed: boolean
  rows: EntryRankRow[]
  /** True when the window hides rows above or below it (render "see all"). */
  truncated: boolean
}

export interface ListBadge {
  myScore: number | null
  myRank: number | null
  total: number
}

export interface OfficialAttempt { id: string; exercise_id: number; user_id: string; score: number; passed: boolean; created_at: string }

type ExerciseLike = { id: number; exercise_type: string | null; is_challengeable: boolean | null }

const order = (a: OfficialAttempt, b: OfficialAttempt) =>
  b.score - a.score || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

export const isChallengeable = (e: ExerciseLike) =>
  e.is_challengeable === true && CHALLENGEABLE_TYPES.includes(e.exercise_type as string)

/** Pure: the viewer's standing from the official attempts of ACTIVE members of one exercise. */
export function buildExerciseEntry(userId: string, attempts: OfficialAttempt[], labels: Map<string, string>): ExerciseEntry | null {
  const board = [...attempts].sort(order)
  const i = board.findIndex((a) => a.user_id === userId)
  if (i === -1) return null
  const all: EntryRankRow[] = board.map((a, idx) => ({
    rank: idx + 1,
    userId: a.user_id,
    label: labels.get(a.user_id) ?? '',
    score: a.score,
    isMe: a.user_id === userId,
  }))
  const rows = windowAround(all)
  return { myScore: board[i].score, myRank: i + 1, total: board.length, passed: board[i].passed, rows, truncated: rows.length < all.length }
}

/** Pure: per-exercise standing for the list badges. */
export function buildListBadges(userId: string, attempts: OfficialAttempt[]): Map<number, ListBadge> {
  const byEx = new Map<number, OfficialAttempt[]>()
  for (const a of attempts) byEx.set(a.exercise_id, [...(byEx.get(a.exercise_id) ?? []), a])
  const out = new Map<number, ListBadge>()
  for (const [id, list] of byEx) {
    const board = list.sort(order)
    const i = board.findIndex((a) => a.user_id === userId)
    out.set(id, { myScore: i === -1 ? null : board[i].score, myRank: i === -1 ? null : i + 1, total: board.length })
  }
  return out
}

async function officialAttempts(admin: Admin, tenantId: string, exerciseIds: number[]): Promise<OfficialAttempt[]> {
  const { data, error } = await admin
    .from('challenge_attempts')
    .select('id, exercise_id, user_id, score, passed, created_at')
    .eq('tenant_id', tenantId)
    .in('exercise_id', exerciseIds)
    .eq('is_official', true)
    .not('user_id', 'is', null)
    .limit(5000)
  if (error) throw new Error(error.message)
  const rows = (data ?? []).filter((a) => !!a.user_id) as OfficialAttempt[]
  if (!rows.length) return []
  const ids = [...new Set(rows.map((a) => a.user_id))]
  // Only ACTIVE members of this tenant rank.
  const { data: members, error: mErr } = await admin
    .from('tenant_users').select('user_id').eq('tenant_id', tenantId).eq('status', 'active').in('user_id', ids)
  if (mErr) throw new Error(mErr.message)
  const active = new Set((members ?? []).map((m) => m.user_id as string))
  return rows.filter((a) => active.has(a.user_id))
}

/**
 * Result-screen block data for ONE exercise, or null when it must stay hidden:
 * not a challengeable essay/discussion, school flag off, or the student has no
 * official attempt (so there is no score to share).
 */
export async function loadExerciseEntry(
  admin: Admin,
  tenantId: string,
  userId: string,
  exercise: ExerciseLike,
): Promise<ExerciseEntry | null> {
  if (!isChallengeable(exercise)) return null
  if (!(await loadChallengesEnabled(admin, tenantId))) return null
  const attempts = await officialAttempts(admin, tenantId, [exercise.id])
  const bare = buildExerciseEntry(userId, attempts, new Map())
  if (!bare) return null
  // Names only for the rows that will be shown.
  const { data: profiles, error } = await admin
    .from('profiles').select('id, full_name').in('id', bare.rows.map((r) => r.userId))
  if (error) throw new Error(error.message)
  const labels = new Map((profiles ?? []).map((p) => [p.id, formatDisplayName(p.full_name)]))
  return buildExerciseEntry(userId, attempts, labels)
}

/** List badges: only challengeable exercises, only when the school has the feature on. */
export async function loadListBadges(
  admin: Admin,
  tenantId: string,
  userId: string,
  exercises: ExerciseLike[],
): Promise<Map<number, ListBadge>> {
  const ids = exercises.filter(isChallengeable).map((e) => e.id)
  if (!ids.length) return new Map()
  if (!(await loadChallengesEnabled(admin, tenantId))) return new Map()
  const badges = buildListBadges(userId, await officialAttempts(admin, tenantId, ids))
  // A challengeable exercise nobody has played still gets its badge.
  for (const id of ids) if (!badges.has(id)) badges.set(id, { myScore: null, myRank: null, total: 0 })
  return badges
}

/**
 * Whether the result screen offers "Play as a challenge" (F3): the exercise is
 * a challengeable essay/discussion, the school has challenges on and the plan
 * can grade them, and the student has NO official attempt yet (otherwise the
 * regular entry block already shows their standing).
 */
export async function canPlayAsChallenge(
  admin: Admin,
  tenantId: string,
  userId: string,
  exercise: ExerciseLike,
  hasAiGrading: (tenantId: string) => Promise<boolean>,
): Promise<boolean> {
  if (!isChallengeable(exercise)) return false
  if (!(await loadChallengesEnabled(admin, tenantId))) return false
  if (!(await hasAiGrading(tenantId))) return false
  const { data, error } = await admin
    .from('challenge_attempts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exercise.id)
    .eq('user_id', userId)
    .eq('is_official', true)
    .limit(1)
  if (error) throw new Error(error.message)
  return (data ?? []).length === 0
}
