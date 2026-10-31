'use server'

import { revalidatePath } from 'next/cache'
import { authenticateUser, requireTeacherOrAdmin } from '@/lib/actions/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPlanFeature } from '@/lib/plans/server'
import { hasCourseAccess } from '@/lib/services/course-access'
import {
  createLinkCore,
  deactivateLinkCore,
  loadChallengesEnabled,
  setChallengeableCore,
  shareableExerciseIds,
} from '@/lib/challenges/links'

/**
 * Challenge-link management (epic #1025, WS5 #1030). `challenge_links` and
 * `challenge_attempts` are server-write only, so every read/write here goes
 * through the admin client — which bypasses RLS, hence the explicit
 * `tenant_id` filter and role/ownership check on each call.
 */

export type ChallengeActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

const fail = (error: string): { success: false; error: string } => ({ success: false, error })

/** Whether the caller's school has challenges switched on (for UI hints). */
export async function getChallengesEnabled(): Promise<boolean> {
  try {
    const ctx = await authenticateUser()
    return await loadChallengesEnabled(createAdminClient(), ctx.tenantId)
  } catch {
    return false
  }
}

/**
 * Create a share link for the caller's OWN official challenge attempt.
 * Idempotent: an existing active link for that attempt is returned as-is.
 * Rules live in `lib/challenges/links.ts`, shared with the MCP tool.
 */
export async function createChallengeLink(
  attemptId: string,
): Promise<ChallengeActionResult<{ id: string; token: string; path: string }>> {
  try {
    const ctx = await authenticateUser()
    const r = await createLinkCore(
      { admin: createAdminClient(), hasAiGrading: (tenantId) => hasPlanFeature(tenantId, 'ai_grading') },
      ctx,
      { attemptId },
    )
    if (!r.ok) return fail(r.error)
    revalidatePath('/dashboard/student/challenges')
    return { success: true, data: { id: r.data.id, token: r.data.token, path: `/reto/${r.data.token}` } }
  } catch (err) {
    console.error('createChallengeLink failed', err)
    return fail('Failed to create link')
  }
}

const coreDeps = () => ({
  admin: createAdminClient(),
  hasAiGrading: (tenantId: string) => hasPlanFeature(tenantId, 'ai_grading'),
})

export type ShareLinkData = {
  id: string
  token: string
  path: string
  reused: boolean
  score: number | null
  /** Staff without an official attempt get a score-less open link. */
  fellBackToOpen?: boolean
}

/**
 * Teacher/admin: the OPEN link of a challengeable exercise (no score), created
 * on first use and reused afterwards. Ownership/plan/tenant rules are the
 * shared core's (#1047).
 */
export async function createOpenChallengeLink(exerciseId: number): Promise<ChallengeActionResult<ShareLinkData>> {
  try {
    const ctx = await requireTeacherOrAdmin()
    const r = await createLinkCore(coreDeps(), ctx, { exerciseId })
    if (!r.ok) return fail(r.error)
    return { success: true, data: { id: r.data.id, token: r.data.token, path: `/reto/${r.data.token}`, reused: r.data.reused, score: null } }
  } catch (err) {
    console.error('createOpenChallengeLink failed', err)
    const msg = err instanceof Error ? err.message : ''
    return fail(msg.startsWith('Unauthorized') ? 'Unauthorized' : 'Failed to create link')
  }
}

/**
 * Signed-in member: link carrying their BEST official attempt on the exercise
 * ("beat my 87"), reusing the active one. Students without an official attempt
 * are refused by the core.
 */
export async function createBestAttemptChallengeLink(exerciseId: number): Promise<ChallengeActionResult<ShareLinkData>> {
  try {
    const ctx = await authenticateUser()
    const r = await createLinkCore(coreDeps(), ctx, { exerciseId, useBestAttempt: true })
    if (!r.ok) return fail(r.error)
    revalidatePath('/dashboard/student/challenges')
    return { success: true, data: { id: r.data.id, token: r.data.token, path: `/reto/${r.data.token}`, reused: r.data.reused, score: r.data.score, fellBackToOpen: r.data.fellBackToOpen } }
  } catch (err) {
    console.error('createBestAttemptChallengeLink failed', err)
    return fail('Failed to create link')
  }
}

/**
 * "Play as a challenge" (F3): a member who finished the exercise normally and
 * has no challenge attempt yet gets a link of their own to play it as a
 * challenge. The first cold attempt through it becomes their official, ranked
 * one. The link carries no score (nothing to beat) and is reused afterwards.
 * Only for members with access to the exercise's course.
 */
export async function createPlayChallengeLink(exerciseId: number): Promise<ChallengeActionResult<ShareLinkData>> {
  try {
    const ctx = await authenticateUser()
    const admin = createAdminClient()
    if (!Number.isInteger(exerciseId)) return fail('Invalid exercise')
    const { data: exercise } = await admin
      .from('exercises')
      .select('course_id')
      .eq('id', exerciseId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (!exercise?.course_id || !(await hasCourseAccess(admin, ctx.userId, exercise.course_id))) return fail('Unauthorized')
    const r = await createLinkCore(coreDeps(), ctx, { exerciseId, forPlay: true })
    if (!r.ok) return fail(r.error)
    revalidatePath('/dashboard/student/challenges')
    return { success: true, data: { id: r.data.id, token: r.data.token, path: `/reto/${r.data.token}`, reused: r.data.reused, score: r.data.score } }
  } catch (err) {
    console.error('createPlayChallengeLink failed', err)
    return fail('Failed to create link')
  }
}

export interface OfficialAttemptRow {
  attemptId: string
  exerciseId: number
  exerciseTitle: string
  score: number
  createdAt: string
}

/** The caller's official attempts that have no ACTIVE link yet (student "Create link" list). */
export async function listUnsharedOfficialAttempts(): Promise<ChallengeActionResult<OfficialAttemptRow[]>> {
  try {
    const ctx = await authenticateUser()
    const admin = createAdminClient()
    const { data: attempts, error } = await admin
      .from('challenge_attempts')
      .select('id, exercise_id, score, created_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .eq('is_official', true)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return fail('Failed to load attempts')
    if (!attempts?.length) return { success: true, data: [] }

    const [{ data: links }, { data: exercises }] = await Promise.all([
      admin
        .from('challenge_links')
        .select('owner_attempt_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('created_by', ctx.userId)
        .eq('active', true)
        .in('owner_attempt_id', attempts.map((a) => a.id)),
      admin
        .from('exercises')
        .select('id, title, is_challengeable, exercise_type')
        .eq('tenant_id', ctx.tenantId)
        .in('id', [...new Set(attempts.map((a) => a.exercise_id))]),
    ])
    const shareable = await shareableExerciseIds(coreDeps(), ctx.tenantId, exercises ?? [])
    const linked = new Set((links ?? []).map((l) => l.owner_attempt_id))
    const byId = new Map((exercises ?? []).map((e) => [e.id, e]))
    return {
      success: true,
      data: attempts
        .filter((a) => !linked.has(a.id) && shareable.has(a.exercise_id))
        .map((a) => ({
          attemptId: a.id,
          exerciseId: a.exercise_id,
          exerciseTitle: byId.get(a.exercise_id)?.title ?? '',
          score: a.score,
          createdAt: a.created_at,
        })),
    }
  } catch (err) {
    console.error('listUnsharedOfficialAttempts failed', err)
    return fail('Failed to load attempts')
  }
}

/** Deactivate a link. Owner may deactivate their own; admin any in the tenant. */
export async function deactivateChallengeLink(linkId: string): Promise<ChallengeActionResult> {
  try {
    const ctx = await authenticateUser()
    const r = await deactivateLinkCore({ admin: createAdminClient() }, ctx, { linkId })
    if (!r.ok) return fail(r.error)
    revalidatePath('/dashboard/student/challenges')
    return { success: true, data: undefined }
  } catch (err) {
    console.error('deactivateChallengeLink failed', err)
    return fail('Failed to deactivate link')
  }
}

export interface ChallengeLinkRow {
  id: string
  token: string
  active: boolean
  createdAt: string
  exerciseId: number
  exerciseTitle: string
  score: number | null
}

/** The caller's own links (admins also see every link in the tenant). */
export async function listChallengeLinks(): Promise<ChallengeActionResult<ChallengeLinkRow[]>> {
  try {
    const ctx = await authenticateUser()
    const admin = createAdminClient()

    let query = admin
      .from('challenge_links')
      .select('id, token, active, created_at, exercise_id, owner_attempt_id, created_by')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (ctx.role !== 'admin') query = query.eq('created_by', ctx.userId)

    const { data: links, error } = await query
    if (error) return fail('Failed to load links')
    if (!links?.length) return { success: true, data: [] }

    const exerciseIds = [...new Set(links.map((l) => l.exercise_id))]
    const attemptIds = links.map((l) => l.owner_attempt_id).filter((v): v is string => !!v)
    const [{ data: exercises }, { data: attempts }] = await Promise.all([
      admin.from('exercises').select('id, title').eq('tenant_id', ctx.tenantId).in('id', exerciseIds),
      attemptIds.length
        ? admin.from('challenge_attempts').select('id, score').eq('tenant_id', ctx.tenantId).in('id', attemptIds)
        : Promise.resolve({ data: [] as { id: string; score: number }[] }),
    ])
    const titles = new Map((exercises ?? []).map((e) => [e.id, e.title]))
    const scores = new Map((attempts ?? []).map((a) => [a.id, a.score]))

    return {
      success: true,
      data: links.map((l) => ({
        id: l.id,
        token: l.token,
        active: l.active,
        createdAt: l.created_at,
        exerciseId: l.exercise_id,
        exerciseTitle: titles.get(l.exercise_id) ?? '',
        score: l.owner_attempt_id ? (scores.get(l.owner_attempt_id) ?? null) : null,
      })),
    }
  } catch (err) {
    console.error('listChallengeLinks failed', err)
    return fail('Failed to load links')
  }
}

/** Mark/unmark an exercise as challengeable. Teacher: own courses only; admin: any. */
export async function setExerciseChallengeable(
  exerciseId: number,
  value: boolean,
): Promise<ChallengeActionResult<{ isChallengeable: boolean }>> {
  try {
    const ctx = await requireTeacherOrAdmin()
    const r = await setChallengeableCore(
      { admin: createAdminClient(), hasAiGrading: (tenantId) => hasPlanFeature(tenantId, 'ai_grading') },
      ctx, exerciseId, value)
    if (!r.ok) return fail(r.error)
    revalidatePath(`/dashboard/teacher/courses/${r.data.courseId}/exercises/${r.data.exerciseId}`)
    return { success: true, data: { isChallengeable: r.data.isChallengeable } }
  } catch (err) {
    console.error('setExerciseChallengeable failed', err)
    // Auth errors from the shared helpers are safe to surface.
    const msg = err instanceof Error ? err.message : ''
    return fail(msg.startsWith('Unauthorized') ? 'Unauthorized' : 'Failed to update exercise')
  }
}
