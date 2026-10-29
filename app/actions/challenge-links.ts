'use server'

import { revalidatePath } from 'next/cache'
import { authenticateUser, requireTeacherOrAdmin } from '@/lib/actions/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPlanFeature } from '@/lib/plans/server'
import { createLinkCore, deactivateLinkCore, loadChallengesEnabled, setChallengeableCore } from '@/lib/challenges/links'

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
    const r = await setChallengeableCore({ admin: createAdminClient() }, ctx, exerciseId, value)
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
