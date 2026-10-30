import { createAdminClient } from '@/lib/supabase/admin'
import { formatDisplayName } from './ranking'

/**
 * Student read side of challenges: the retos a member created or played, with
 * their standing against friends. Admin client (tables are server-write/read
 * only) scoped by tenant. Only SAFE data leaves: first name + initial (null =
 * guest, rendered "Invitado"), scores, counts. Never answers, feedback or hashes.
 */
type Admin = ReturnType<typeof createAdminClient>

export interface RetoStanding {
  /** Stable React key; not an id of anyone's account. */
  key: string
  /** First name + initial; null = guest / non-member. '' = member without a name. */
  label: string | null
  score: number
  isMe: boolean
  /** my score − their score (null for my own row or when I have no official score). */
  delta: number | null
}

export interface StudentReto {
  exerciseId: number
  title: string
  courseTitle: string
  myScore: number | null
  /** 1-based position among official scores; null when I have none. */
  myRank: number | null
  totalPlayers: number
  myPlays: number
  /** Plays by others through links I created. */
  friendPlays: number
  /** Distinct people who played through my links, safe labels (null = guest). */
  joined: (string | null)[]
  createdLink: boolean
  leaderboard: RetoStanding[]
}

interface AttemptRow { id: string; exercise_id: number; user_id: string | null; guest_token_hash: string | null; link_id: string | null; score: number; is_official: boolean; created_at: string }

export function buildStudentRetos(input: {
  userId: string
  exercises: { id: number; title: string; courseTitle: string }[]
  attempts: AttemptRow[]
  myLinkIds: Set<string>
  labels: Map<string, string>
  activeMembers: Set<string>
}): StudentReto[] {
  const labelOf = (uid: string | null): string | null =>
    uid && input.activeMembers.has(uid) ? (input.labels.get(uid) ?? '') : null
  const out: StudentReto[] = []
  for (const ex of input.exercises) {
    const all = input.attempts.filter((a) => a.exercise_id === ex.id)
    const mine = all.filter((a) => a.user_id === input.userId)
    const board = all
      .filter((a) => a.is_official)
      .sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    const myOfficial = board.find((a) => a.user_id === input.userId)
    const viaMine = all.filter((a) => a.link_id && input.myLinkIds.has(a.link_id) && a.user_id !== input.userId)
    const joinedKeys = new Map<string, string | null>()
    for (const a of viaMine) joinedKeys.set(a.user_id ?? `g:${a.guest_token_hash}`, labelOf(a.user_id))
    out.push({
      exerciseId: ex.id,
      title: ex.title,
      courseTitle: ex.courseTitle,
      myScore: myOfficial?.score ?? null,
      myRank: myOfficial ? board.indexOf(myOfficial) + 1 : null,
      totalPlayers: board.length,
      myPlays: mine.length,
      friendPlays: viaMine.length,
      joined: [...joinedKeys.values()],
      createdLink: all.some((a) => a.link_id && input.myLinkIds.has(a.link_id)) || false,
      leaderboard: board.map((a) => ({
        key: a.id,
        label: labelOf(a.user_id),
        score: a.score,
        isMe: a.user_id === input.userId,
        delta: myOfficial && a !== myOfficial ? myOfficial.score - a.score : null,
      })),
    })
  }
  // Retos I'm standing in first, then by activity.
  return out.sort((a, b) => b.friendPlays + b.myPlays - (a.friendPlays + a.myPlays))
}

export async function loadStudentRetos(tenantId: string, userId: string, admin: Admin = createAdminClient()): Promise<StudentReto[]> {
  const [{ data: myLinks, error: lErr }, { data: myAttempts, error: mErr }] = await Promise.all([
    admin.from('challenge_links').select('id, exercise_id').eq('tenant_id', tenantId).eq('created_by', userId),
    admin.from('challenge_attempts').select('exercise_id').eq('tenant_id', tenantId).eq('user_id', userId),
  ])
  if (lErr || mErr) throw new Error((lErr ?? mErr)!.message)
  const exerciseIds = [...new Set([...(myLinks ?? []).map((l) => l.exercise_id), ...(myAttempts ?? []).map((a) => a.exercise_id)])]
  if (!exerciseIds.length) return []

  const [{ data: exercises, error: eErr }, { data: attempts, error: aErr }] = await Promise.all([
    admin.from('exercises').select('id, title, course_id').eq('tenant_id', tenantId).in('id', exerciseIds),
    admin.from('challenge_attempts')
      .select('id, exercise_id, user_id, guest_token_hash, link_id, score, is_official, created_at')
      .eq('tenant_id', tenantId).in('exercise_id', exerciseIds).order('created_at').limit(5000),
  ])
  if (eErr || aErr) throw new Error((eErr ?? aErr)!.message)

  const userIds = [...new Set((attempts ?? []).map((a) => a.user_id).filter((id): id is string => !!id))]
  const courseIds = [...new Set((exercises ?? []).map((e) => e.course_id))]
  const [members, profiles, courses] = await Promise.all([
    userIds.length ? admin.from('tenant_users').select('user_id').eq('tenant_id', tenantId).eq('status', 'active').in('user_id', userIds) : { data: [], error: null },
    userIds.length ? admin.from('profiles').select('id, full_name').in('id', userIds) : { data: [], error: null },
    courseIds.length ? admin.from('courses').select('course_id, title').eq('tenant_id', tenantId).in('course_id', courseIds) : { data: [], error: null },
  ])
  const failed = members.error ?? profiles.error ?? courses.error
  if (failed) throw new Error(failed.message)
  const courseTitle = new Map((courses.data ?? []).map((c) => [c.course_id, c.title as string]))

  return buildStudentRetos({
    userId,
    exercises: (exercises ?? []).map((e) => ({ id: e.id, title: e.title, courseTitle: courseTitle.get(e.course_id) ?? '' })),
    attempts: attempts ?? [],
    myLinkIds: new Set((myLinks ?? []).map((l) => l.id)),
    labels: new Map((profiles.data ?? []).map((p) => [p.id, formatDisplayName(p.full_name)])),
    activeMembers: new Set((members.data ?? []).map((m) => m.user_id as string)),
  })
}
