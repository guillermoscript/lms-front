'use server'

import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'
import { authenticateUser, requireTeacherOrAdmin, verifyCourseOwnership } from '@/lib/actions/utils'
import { createAdminClient } from '@/lib/supabase/admin'

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

async function isChallengesEnabled(tenantId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'challenges_enabled')
    .maybeSingle()
  const v = data?.setting_value as unknown
  if (v && typeof v === 'object') return (v as { enabled?: unknown }).enabled === true
  return v === true
}

/**
 * Create a share link for the caller's OWN official challenge attempt.
 * Idempotent: an existing active link for that attempt is returned as-is.
 */
export async function createChallengeLink(
  attemptId: string,
): Promise<ChallengeActionResult<{ id: string; token: string; path: string }>> {
  try {
    const ctx = await authenticateUser()
    if (typeof attemptId !== 'string' || !attemptId) return fail('Invalid attempt')
    if (!(await isChallengesEnabled(ctx.tenantId))) return fail('Challenges are not enabled')

    const admin = createAdminClient()
    const { data: attempt } = await admin
      .from('challenge_attempts')
      .select('id, exercise_id, user_id, is_official')
      .eq('id', attemptId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (!attempt || attempt.user_id !== ctx.userId) return fail('Attempt not found')
    if (!attempt.is_official) return fail('Only an official attempt can be shared')

    const { data: exercise } = await admin
      .from('exercises')
      .select('id, is_challengeable')
      .eq('id', attempt.exercise_id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (!exercise?.is_challengeable) return fail('Exercise is not challengeable')

    const { data: existing } = await admin
      .from('challenge_links')
      .select('id, token')
      .eq('tenant_id', ctx.tenantId)
      .eq('owner_attempt_id', attempt.id)
      .eq('created_by', ctx.userId)
      .eq('active', true)
      .maybeSingle()
    if (existing) {
      return { success: true, data: { ...existing, path: `/reto/${existing.token}` } }
    }

    const token = nanoid(12)
    const { data: link, error } = await admin
      .from('challenge_links')
      .insert({
        tenant_id: ctx.tenantId,
        exercise_id: attempt.exercise_id,
        token,
        created_by: ctx.userId,
        owner_attempt_id: attempt.id,
      })
      .select('id, token')
      .single()
    if (error || !link) return fail('Failed to create link')

    revalidatePath('/dashboard/student/challenges')
    return { success: true, data: { ...link, path: `/reto/${link.token}` } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to create link')
  }
}

/** Deactivate a link. Owner may deactivate their own; admin any in the tenant. */
export async function deactivateChallengeLink(linkId: string): Promise<ChallengeActionResult> {
  try {
    const ctx = await authenticateUser()
    if (typeof linkId !== 'string' || !linkId) return fail('Invalid link')

    const admin = createAdminClient()
    const { data: link } = await admin
      .from('challenge_links')
      .select('id, created_by')
      .eq('id', linkId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (!link) return fail('Link not found')
    if (ctx.role !== 'admin' && link.created_by !== ctx.userId) return fail('Unauthorized')

    const { error } = await admin
      .from('challenge_links')
      .update({ active: false })
      .eq('id', link.id)
      .eq('tenant_id', ctx.tenantId)
    if (error) return fail('Failed to deactivate link')

    revalidatePath('/dashboard/student/challenges')
    return { success: true, data: undefined }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to deactivate link')
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
    return fail(err instanceof Error ? err.message : 'Failed to load links')
  }
}

/** Mark/unmark an exercise as challengeable. Teacher: own courses only; admin: any. */
export async function setExerciseChallengeable(
  exerciseId: number,
  value: boolean,
): Promise<ChallengeActionResult<{ isChallengeable: boolean }>> {
  try {
    const ctx = await requireTeacherOrAdmin()
    if (!Number.isInteger(exerciseId) || typeof value !== 'boolean') return fail('Invalid input')

    const { data: exercise } = await ctx.supabase
      .from('exercises')
      .select('id, course_id')
      .eq('id', exerciseId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (!exercise || exercise.course_id == null) return fail('Exercise not found')
    await verifyCourseOwnership(ctx, exercise.course_id)

    const { error } = await ctx.supabase
      .from('exercises')
      .update({ is_challengeable: value })
      .eq('id', exercise.id)
      .eq('tenant_id', ctx.tenantId)
    if (error) return fail('Failed to update exercise')

    revalidatePath(`/dashboard/teacher/courses/${exercise.course_id}/exercises/${exercise.id}`)
    return { success: true, data: { isChallengeable: value } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to update exercise')
  }
}
