import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

/**
 * Staff (teacher/admin) read side of exercise challenges (#1025 follow-up).
 * `challenge_links` / `challenge_attempts` are server-write only and have no
 * client policies, so everything here uses the admin client: callers MUST have
 * resolved `tenantId`/`userId`/`role` from the session, and every query filters
 * `tenant_id` explicitly. Guest/IP hashes are read only to count unique players
 * and never leave this module.
 */

type Admin = ReturnType<typeof createAdminClient>

export interface StaffScope {
  tenantId: string
  userId: string
  role: 'teacher' | 'admin'
}

export interface StaffChallengeAttempt {
  id: string
  /** Member display name; null for a guest who never claimed an account. */
  playerName: string | null
  isGuest: boolean
  score: number
  passed: boolean
  isOfficial: boolean
  answer: string
  feedback: string
  createdAt: string
  linkId: string | null
  /** Public path of the link the attempt came through (`/reto/<token>`), if any. */
  linkPath: string | null
}

export interface StaffChallengeLink {
  id: string
  path: string
  active: boolean
  createdAt: string
  creatorName: string | null
  plays: number
}

export interface StaffChallengeRow {
  exerciseId: number
  title: string
  courseId: number
  courseTitle: string
  isChallengeable: boolean
  creators: string[]
  firstLinkAt: string | null
  activeLinks: number
  revokedLinks: number
  plays: number
  officialPlays: number
  uniquePlayers: number
  avgScore: number | null
  topScore: number | null
  claimedGuests: number
}

interface LinkRow { id: string; token: string; exercise_id: number; created_by: string | null; active: boolean; created_at: string }
interface AttemptStatRow {
  exercise_id: number
  user_id: string | null
  guest_token_hash: string | null
  score: number
  is_official: boolean
}
interface ExerciseRow { id: number; title: string; course_id: number; is_challengeable: boolean | null }
interface CourseRow { course_id: number; title: string; author_id: string | null }

/** Pure aggregation: one row per exercise that has links, plays or the opt-in flag. */
export function buildChallengeOverview(input: {
  exercises: ExerciseRow[]
  courses: CourseRow[]
  links: LinkRow[]
  attempts: AttemptStatRow[]
  names: Map<string, string>
  scope: Pick<StaffScope, 'userId' | 'role'>
}): StaffChallengeRow[] {
  const courseById = new Map(input.courses.map((c) => [c.course_id, c]))
  const rows: StaffChallengeRow[] = []
  for (const ex of input.exercises) {
    const course = courseById.get(ex.course_id)
    if (!course) continue
    if (input.scope.role !== 'admin' && course.author_id !== input.scope.userId) continue

    const links = input.links.filter((l) => l.exercise_id === ex.id)
    const attempts = input.attempts.filter((a) => a.exercise_id === ex.id)
    if (!links.length && !attempts.length && !ex.is_challengeable) continue

    const official = attempts.filter((a) => a.is_official)
    const players = new Set(attempts.map((a) => (a.user_id ? `u:${a.user_id}` : `g:${a.guest_token_hash}`)))
    // A claimed guest keeps its token hash and gains a user_id.
    const claimed = new Set(attempts.filter((a) => a.user_id && a.guest_token_hash).map((a) => a.user_id))
    const creators = [...new Set(links.map((l) => l.created_by).filter((id): id is string => !!id))]
      .map((id) => input.names.get(id))
      .filter((n): n is string => !!n)
    const sortedLinks = [...links].sort((a, b) => a.created_at.localeCompare(b.created_at))

    rows.push({
      exerciseId: ex.id,
      title: ex.title,
      courseId: course.course_id,
      courseTitle: course.title,
      isChallengeable: ex.is_challengeable === true,
      creators,
      firstLinkAt: sortedLinks[0]?.created_at ?? null,
      activeLinks: links.filter((l) => l.active).length,
      revokedLinks: links.filter((l) => !l.active).length,
      plays: attempts.length,
      officialPlays: official.length,
      uniquePlayers: players.size,
      avgScore: official.length ? Math.round(official.reduce((s, a) => s + a.score, 0) / official.length) : null,
      topScore: official.length ? Math.max(...official.map((a) => a.score)) : null,
      claimedGuests: claimed.size,
    })
  }
  // Most played first, then newest link.
  return rows.sort((a, b) => b.plays - a.plays || (b.firstLinkAt ?? '').localeCompare(a.firstLinkAt ?? ''))
}

async function loadNames(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const { data, error } = await admin.from('profiles').select('id, full_name').in('id', unique)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).filter((p) => p.full_name).map((p) => [p.id, p.full_name as string]))
}

/** Constant number of queries regardless of how many exercises/links exist (no N+1). */
export async function loadChallengeOverview(scope: StaffScope, admin: Admin = createAdminClient()): Promise<StaffChallengeRow[]> {
  const [links, attempts, flagged] = await Promise.all([
    fetchAllRows<LinkRow>('challenge_links', (from, to) =>
      admin.from('challenge_links').select('id, token, exercise_id, created_by, active, created_at', { count: 'exact' })
        .eq('tenant_id', scope.tenantId).order('id').range(from, to)),
    fetchAllRows<AttemptStatRow>('challenge_attempts', (from, to) =>
      admin.from('challenge_attempts').select('id, exercise_id, user_id, guest_token_hash, score, is_official', { count: 'exact' })
        .eq('tenant_id', scope.tenantId).order('id').range(from, to)),
    admin.from('exercises').select('id').eq('tenant_id', scope.tenantId).eq('is_challengeable', true),
  ])
  if (flagged.error) throw new Error(flagged.error.message)

  const exerciseIds = [...new Set([...links.map((l) => l.exercise_id), ...attempts.map((a) => a.exercise_id), ...(flagged.data ?? []).map((e) => e.id)])]
  if (!exerciseIds.length) return []

  const { data: exercises, error: exErr } = await admin
    .from('exercises').select('id, title, course_id, is_challengeable')
    .eq('tenant_id', scope.tenantId).in('id', exerciseIds)
  if (exErr) throw new Error(exErr.message)
  const { data: courses, error: cErr } = await admin
    .from('courses').select('course_id, title, author_id')
    .eq('tenant_id', scope.tenantId).in('course_id', [...new Set((exercises ?? []).map((e) => e.course_id))])
  if (cErr) throw new Error(cErr.message)

  const names = await loadNames(admin, links.map((l) => l.created_by).filter((id): id is string => !!id))
  return buildChallengeOverview({ exercises: exercises ?? [], courses: courses ?? [], links, attempts, names, scope })
}

/** The text of a stored answer / feedback jsonb. */
export function answerText(raw: unknown): string {
  return raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string' ? (raw as { text: string }).text : ''
}
export function feedbackText(raw: unknown): string {
  return raw && typeof raw === 'object' && typeof (raw as { feedback?: unknown }).feedback === 'string' ? (raw as { feedback: string }).feedback : ''
}

/**
 * Every challenge play of ONE exercise (newest first) plus its links. The
 * caller must already have verified the viewer is the course author or an
 * admin of `tenantId`.
 */
export async function loadExerciseChallengePlays(
  tenantId: string,
  exerciseId: number,
  admin: Admin = createAdminClient(),
): Promise<{ attempts: StaffChallengeAttempt[]; links: StaffChallengeLink[] }> {
  const [{ data: attemptRows, error: aErr }, { data: linkRows, error: lErr }] = await Promise.all([
    admin.from('challenge_attempts')
      .select('id, user_id, guest_token_hash, score, passed, is_official, answer, feedback, created_at, link_id')
      .eq('tenant_id', tenantId).eq('exercise_id', exerciseId)
      .order('created_at', { ascending: false }).limit(500),
    admin.from('challenge_links')
      .select('id, token, created_by, active, created_at')
      .eq('tenant_id', tenantId).eq('exercise_id', exerciseId)
      .order('created_at', { ascending: false }),
  ])
  if (aErr || lErr) throw new Error((aErr ?? lErr)!.message)

  const names = await loadNames(admin, [
    ...(attemptRows ?? []).map((a) => a.user_id).filter((id): id is string => !!id),
    ...(linkRows ?? []).map((l) => l.created_by).filter((id): id is string => !!id),
  ])
  const pathById = new Map((linkRows ?? []).map((l) => [l.id, `/reto/${l.token}`]))
  const playsByLink = new Map<string, number>()
  for (const a of attemptRows ?? []) if (a.link_id) playsByLink.set(a.link_id, (playsByLink.get(a.link_id) ?? 0) + 1)

  return {
    attempts: (attemptRows ?? []).map((a) => ({
      id: a.id,
      playerName: a.user_id ? (names.get(a.user_id) ?? null) : null,
      isGuest: !a.user_id,
      score: a.score,
      passed: a.passed,
      isOfficial: a.is_official,
      answer: answerText(a.answer),
      feedback: feedbackText(a.feedback),
      createdAt: a.created_at,
      linkId: a.link_id,
      linkPath: a.link_id ? (pathById.get(a.link_id) ?? null) : null,
    })),
    links: (linkRows ?? []).map((l) => ({
      id: l.id,
      path: `/reto/${l.token}`,
      active: l.active,
      createdAt: l.created_at,
      creatorName: l.created_by ? (names.get(l.created_by) ?? null) : null,
      plays: playsByLink.get(l.id) ?? 0,
    })),
  }
}

/** Official plays, best first (earliest wins ties) — the staff leaderboard. */
export function leaderboardOf(attempts: StaffChallengeAttempt[]): StaffChallengeAttempt[] {
  return attempts
    .filter((a) => a.isOfficial)
    .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt))
}
