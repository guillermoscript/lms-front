import { nanoid } from 'nanoid'
import type { createAdminClient } from '@/lib/supabase/admin'
import { isChallengesEnabled } from './settings'

/**
 * Challenge-link rules shared by the server actions (web) and
 * `POST /api/challenges/manage` (the LMS MCP server calls that route with the
 * caller's token, because `challenge_links` is server-write only and the MCP
 * package never holds the service role for data). One implementation, so the
 * web UI and the AI cannot drift (epic #1025, WS9 #1043).
 *
 * Everything runs on the admin client, which bypasses RLS: each query carries an
 * explicit `tenant_id` filter and the actor's role/ownership is checked here.
 * No `next/*` imports: callers do their own revalidation.
 */

type Admin = ReturnType<typeof createAdminClient>

export type ChallengeRole = 'student' | 'teacher' | 'admin'

export interface ChallengeActor {
  tenantId: string
  userId: string
  role: ChallengeRole
}

export interface ChallengeLinkDeps {
  admin: Admin
  /** Plan gate `ai_grading` (the tenant's key pays for grading). */
  hasAiGrading: (tenantId: string) => Promise<boolean>
}

export type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Guests can only play free-text exercises; quiz-like types are out. */
export const CHALLENGEABLE_TYPES = ['essay', 'discussion']

/** Shown by tools/UI when an exercise becomes challengeable. */
export const CHALLENGE_PUBLIC_WARNING =
  'The exercise title and instructions become publicly readable by anyone with a challenge link. ' +
  'If the exercise belongs to a paid course, guests only get this one exercise as a sample: no access to the course is granted.'

export async function loadChallengesEnabled(admin: Admin, tenantId: string): Promise<boolean> {
  const { data } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'challenges_enabled')
    .maybeSingle()
  return isChallengesEnabled(data?.setting_value)
}

/** Teacher: own courses only; admin: any course of the tenant. Students never. */
async function canManageCourse(admin: Admin, actor: ChallengeActor, courseId: number): Promise<boolean> {
  if (actor.role === 'student') return false
  const { data: course } = await admin
    .from('courses')
    .select('author_id, tenant_id')
    .eq('course_id', courseId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!course) return false
  return actor.role === 'admin' || course.author_id === actor.userId
}

/**
 * Which of these exercises a member can currently share a link for: the same
 * eligibility `createLinkCore` enforces (challenges on, plan gate, type,
 * challengeable). Lets UI lists avoid offering a button that would be refused.
 */
export async function shareableExerciseIds(
  deps: ChallengeLinkDeps,
  tenantId: string,
  exercises: { id: number; is_challengeable: boolean | null; exercise_type: string | null }[],
): Promise<Set<number>> {
  if (!exercises.length) return new Set()
  if (!(await loadChallengesEnabled(deps.admin, tenantId))) return new Set()
  if (!(await deps.hasAiGrading(tenantId))) return new Set()
  return new Set(
    exercises
      .filter((e) => e.is_challengeable === true && CHALLENGEABLE_TYPES.includes(e.exercise_type as string))
      .map((e) => e.id),
  )
}

export interface LinkResult {
  id: string
  token: string
  /** True when the link carries the creator's official score. */
  withScore: boolean
  score: number | null
  /** True when an existing active link was returned instead of a new one. */
  reused: boolean
  exerciseId: number
  /** Set when `useBestAttempt` was asked but the caller has no official attempt. */
  fellBackToOpen: boolean
}

export async function setChallengeableCore(
  deps: ChallengeLinkDeps,
  actor: ChallengeActor,
  exerciseId: number,
  value: boolean,
): Promise<CoreResult<{ exerciseId: number; courseId: number; isChallengeable: boolean }>> {
  const { admin } = deps
  if (actor.role === 'student') return fail('Unauthorized')
  if (!Number.isInteger(exerciseId) || typeof value !== 'boolean') return fail('Invalid input')

  const { data: exercise } = await admin
    .from('exercises')
    .select('id, course_id, exercise_type')
    .eq('id', exerciseId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!exercise || exercise.course_id == null) return fail('Exercise not found')
  if (!(await canManageCourse(admin, actor, exercise.course_id))) return fail('Unauthorized')

  if (value) {
    if (!CHALLENGEABLE_TYPES.includes(exercise.exercise_type as string)) {
      return fail('Only essay and discussion exercises can be challenges')
    }
    if (!(await loadChallengesEnabled(admin, actor.tenantId))) {
      return fail('Challenges are not enabled for this school')
    }
    if (!(await deps.hasAiGrading(actor.tenantId))) {
      return fail('The school plan does not include AI grading, so challenges cannot be played. Upgrade the plan first.')
    }
  }

  const { error } = await admin
    .from('exercises')
    .update({ is_challengeable: value })
    .eq('id', exercise.id)
    .eq('tenant_id', actor.tenantId)
  if (error) return fail('Failed to update exercise')
  return { ok: true, data: { exerciseId: exercise.id, courseId: exercise.course_id, isChallengeable: value } }
}

export interface CreateLinkInput {
  /** Share this official attempt ("beat my 87"). Must be the caller's own. */
  attemptId?: string
  /** Required unless `attemptId` is given. */
  exerciseId?: number
  /** Use the caller's best official attempt on the exercise, else an open link. */
  useBestAttempt?: boolean
  /**
   * "Play as a challenge" (F3): the caller wants to PLAY the exercise as a
   * challenge, not to share a result. With no official attempt yet, any role
   * gets their own open link (a student included: it carries no score and only
   * opens the cold attempt, which becomes their official one).
   */
  forPlay?: boolean
}

type LinkRow = { id: string; token: string }

async function insertLink(
  admin: Admin,
  row: { tenant_id: string; exercise_id: number; created_by: string; owner_attempt_id: string | null },
  findExisting: () => Promise<LinkRow | null>,
): Promise<LinkRow | null> {
  for (let i = 0; i < 3; i++) {
    const { data, error } = await admin
      .from('challenge_links')
      .insert({ ...row, token: nanoid(12) })
      .select('id, token')
      .single()
    if (data) return data
    if (error?.code !== '23505') return null
    // Unique violation: a token collision (retry with a fresh one) or a
    // concurrent request that already created the active link.
    const raced = await findExisting()
    if (raced) return raced
  }
  return null
}

/**
 * Create (or return the existing) share link.
 *
 *  - `attemptId`: the caller's OWN official attempt, any role.
 *  - `exerciseId` + `useBestAttempt`: the caller's best official attempt, falling
 *    back to an open link when there is none (staff only, see below).
 *  - `exerciseId` alone: an OPEN link (no score). Staff only: a student can only
 *    share a result they earned, never open invitations to an exercise.
 *
 * Idempotent: one active link per attempt, and one active open link per
 * exercise + creator.
 */
export async function createLinkCore(
  deps: ChallengeLinkDeps,
  actor: ChallengeActor,
  input: CreateLinkInput,
): Promise<CoreResult<LinkResult>> {
  const { admin } = deps
  const { tenantId, userId } = actor
  if (input.attemptId !== undefined && (typeof input.attemptId !== 'string' || !input.attemptId)) {
    return fail('Invalid attempt')
  }
  if (input.attemptId === undefined && !Number.isInteger(input.exerciseId)) return fail('Invalid exercise')

  if (!(await loadChallengesEnabled(admin, tenantId))) return fail('Challenges are not enabled')
  if (!(await deps.hasAiGrading(tenantId))) return fail('The school plan does not include AI grading')

  let attempt: { id: string; exercise_id: number; score: number } | null = null
  let fellBackToOpen = false
  let selfPlay = false

  if (input.attemptId !== undefined) {
    const { data } = await admin
      .from('challenge_attempts')
      .select('id, exercise_id, user_id, is_official, score')
      .eq('id', input.attemptId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!data || data.user_id !== userId) return fail('Attempt not found')
    if (!data.is_official) return fail('Only an official attempt can be shared')
    if (input.exerciseId !== undefined && input.exerciseId !== data.exercise_id) {
      return fail('Attempt does not belong to that exercise')
    }
    attempt = data
  } else if (input.useBestAttempt || input.forPlay || actor.role === 'student') {
    const { data } = await admin
      .from('challenge_attempts')
      .select('id, exercise_id, score')
      .eq('tenant_id', tenantId)
      .eq('exercise_id', input.exerciseId as number)
      .eq('user_id', userId)
      .eq('is_official', true)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (data) attempt = data
    else if (input.forPlay) selfPlay = true
    else if (actor.role === 'student') return fail('Play the challenge first: students can only share their own official result')
    else fellBackToOpen = true
  }

  const exerciseId = attempt?.exercise_id ?? (input.exerciseId as number)
  const { data: exercise } = await admin
    .from('exercises')
    .select('id, course_id, is_challengeable, exercise_type')
    .eq('id', exerciseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!exercise?.is_challengeable) return fail('Exercise is not challengeable')
  if (!CHALLENGEABLE_TYPES.includes(exercise.exercise_type as string)) {
    return fail('Only essay and discussion exercises can be challenges')
  }
  // An open link is an invitation the creator makes on the school's behalf:
  // same ownership rule as marking the exercise. A `forPlay` link is the
  // caller's own entry to the cold attempt, not an invitation they publish.
  if (!attempt && !selfPlay && (exercise.course_id == null || !(await canManageCourse(admin, actor, exercise.course_id)))) {
    return fail('Unauthorized')
  }

  const find = async (): Promise<LinkRow | null> => {
    let q = admin
      .from('challenge_links')
      .select('id, token')
      .eq('tenant_id', tenantId)
      .eq('exercise_id', exerciseId)
      .eq('created_by', userId)
      .eq('active', true)
    q = attempt ? q.eq('owner_attempt_id', attempt.id) : q.is('owner_attempt_id', null)
    const { data } = await q.limit(1).maybeSingle()
    return data
  }

  const result = (link: LinkRow, reused: boolean): CoreResult<LinkResult> => ({
    ok: true,
    data: {
      ...link,
      withScore: Boolean(attempt),
      score: attempt?.score ?? null,
      reused,
      exerciseId,
      fellBackToOpen,
    },
  })

  const existing = await find()
  if (existing) return result(existing, true)

  const created = await insertLink(
    admin,
    { tenant_id: tenantId, exercise_id: exerciseId, created_by: userId, owner_attempt_id: attempt?.id ?? null },
    find,
  )
  if (!created) return fail('Failed to create link')
  return result(created, false)
}

/** Owner may deactivate their own link; admin any link of the tenant. By token or id. */
export async function deactivateLinkCore(
  deps: Pick<ChallengeLinkDeps, 'admin'>,
  actor: ChallengeActor,
  ref: { linkId: string } | { token: string },
): Promise<CoreResult<{ id: string; token: string }>> {
  const { admin } = deps
  const key = 'linkId' in ref ? ref.linkId : ref.token
  if (typeof key !== 'string' || !key) return fail('Invalid link')

  const { data: link } = await admin
    .from('challenge_links')
    .select('id, token, created_by')
    .eq('tenant_id', actor.tenantId)
    .eq('linkId' in ref ? 'id' : 'token', key)
    .maybeSingle()
  if (!link) return fail('Link not found')
  if (actor.role !== 'admin' && link.created_by !== actor.userId) return fail('Unauthorized')

  const { error } = await admin
    .from('challenge_links')
    .update({ active: false })
    .eq('id', link.id)
    .eq('tenant_id', actor.tenantId)
  if (error) return fail('Failed to deactivate link')
  return { ok: true, data: { id: link.id, token: link.token } }
}
