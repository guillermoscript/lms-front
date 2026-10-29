import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Guest → member claim for exercise challenges (epic #1025, WS4 #1029).
 *
 * SECURITY: this module never grants access. It attaches an attempt to a user
 * and reports whether the course is free; the only grant path is the
 * `grant_free_entitlement` RPC, called by the server action as the signed-in
 * user and only when `courseIsFree` says so (the RPC re-checks the same rule).
 */

/** httpOnly cookie that carries the raw guest token set when the guest played. */
export const CHALLENGE_GUEST_COOKIE = 'challenge_guest'

/** What `challenge_attempts.guest_token_hash` stores: sha256 hex of the raw token. */
export function hashGuestToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export type ClaimResult =
  | {
      ok: true
      /** `already_claimed` = nothing changed (idempotent repeat). */
      status: 'claimed' | 'already_claimed'
      attempt: { id: string; score: number; passed: boolean; isOfficial: boolean }
      exerciseId: number
      courseId: number
      courseAccess: CourseAccessKind
    }
  | {
      ok: false
      code: 'invalid_link' | 'unavailable' | 'no_attempt' | 'banned' | 'not_member' | 'claim_failed'
    }

export type CourseAccessKind = 'free' | 'paid' | 'unknown'

/**
 * Same rule as `grant_free_entitlement` (migration 20261022160000): a course
 * is paid when any product linked to it has price <> 0, or any non-deleted
 * plan that includes it has price > 0. A query error is `'unknown'`: callers
 * must never grant on anything but `'free'`.
 */
export async function getCourseAccessKind(
  admin: SupabaseClient,
  tenantId: string,
  courseId: number,
): Promise<CourseAccessKind> {
  const { data: links, error: linkError } = await admin
    .from('product_courses')
    .select('product_id')
    .eq('tenant_id', tenantId)
    .eq('course_id', courseId)
  if (linkError) return 'unknown'

  const productIds = (links ?? []).map((l) => l.product_id as number)
  if (productIds.length > 0) {
    const { data: products, error } = await admin
      .from('products')
      .select('product_id, price')
      .eq('tenant_id', tenantId)
      .in('product_id', productIds)
    if (error) return 'unknown'
    if ((products ?? []).some((p) => Number(p.price) !== 0)) return 'paid'
  }

  const { data: planLinks, error: planLinkError } = await admin
    .from('plan_courses')
    .select('plan_id')
    .eq('course_id', courseId)
  if (planLinkError) return 'unknown'

  const planIds = (planLinks ?? []).map((l) => l.plan_id as number)
  if (planIds.length > 0) {
    const { data: plans, error } = await admin
      .from('plans')
      .select('plan_id, price')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .in('plan_id', planIds)
    if (error) return 'unknown'
    if ((plans ?? []).some((p) => Number(p.price) > 0)) return 'paid'
  }

  return 'free'
}

/**
 * Attach the guest's attempt(s) to `userId`. Idempotent: a second call finds
 * the attempt already owned by the user and changes nothing. If the user
 * already holds an official attempt for the exercise, the guest attempt(s)
 * become practice (never a second official one, never replacing theirs).
 *
 * Writes use the admin client with manual tenant validation: the link, the
 * exercise and every attempt must belong to `tenantId`, and the user must be
 * an ACTIVE member of it (a banned or removed user is rejected).
 */
export async function claimChallengeAttempt({
  admin,
  userId,
  tenantId,
  linkToken,
  guestToken,
}: {
  admin: SupabaseClient
  userId: string
  tenantId: string
  linkToken: string
  /** Raw value of the httpOnly guest cookie. */
  guestToken: string | null | undefined
}): Promise<ClaimResult> {
  if (!guestToken || !linkToken) return { ok: false, code: 'no_attempt' }

  const { data: membership } = await admin
    .from('tenant_users')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  if (membership?.status === 'banned') return { ok: false, code: 'banned' }
  if (membership?.status !== 'active') return { ok: false, code: 'not_member' }

  const { data: link } = await admin
    .from('challenge_links')
    .select('id, tenant_id, exercise_id, active')
    .eq('token', linkToken)
    .maybeSingle()
  // The link must belong to the host tenant; never trust a cross-tenant token.
  if (!link || link.tenant_id !== tenantId) return { ok: false, code: 'invalid_link' }
  // A deactivated link, a disabled tenant or a no-longer-challengeable
  // exercise must claim and grant nothing.
  if (link.active !== true) return { ok: false, code: 'unavailable' }

  const { data: exercise } = await admin
    .from('exercises')
    .select('id, course_id, tenant_id, status, is_challengeable')
    .eq('id', link.exercise_id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!exercise) return { ok: false, code: 'invalid_link' }
  if (exercise.status !== 'published' || exercise.is_challengeable !== true) {
    return { ok: false, code: 'unavailable' }
  }

  const { data: setting } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'challenges_enabled')
    .maybeSingle()
  if (setting?.setting_value !== true) return { ok: false, code: 'unavailable' }

  const exerciseId = exercise.id as number
  const courseId = exercise.course_id as number
  const guestHash = hashGuestToken(guestToken)

  type Row = { id: string; user_id: string | null; is_official: boolean; score: number; passed: boolean; created_at: string }
  const cols = 'id, user_id, is_official, score, passed, created_at'

  const { data: guestRows } = await admin
    .from('challenge_attempts')
    .select(cols)
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exerciseId)
    .eq('guest_token_hash', guestHash)
    .is('user_id', null)
    .order('created_at', { ascending: true })
  const toClaim = (guestRows ?? []) as Row[]

  const { data: ownRows } = await admin
    .from('challenge_attempts')
    .select(cols)
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exerciseId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  const own = (ownRows ?? []) as Row[]
  const ownOfficial = own.find((r) => r.is_official)

  const courseAccess = await getCourseAccessKind(admin, tenantId, courseId)
  const base = { exerciseId, courseId, courseAccess }

  if (toClaim.length === 0) {
    // Nothing left to attach: a repeat call, or the cookie never matched.
    const mine = ownOfficial ?? own[0]
    if (!mine) return { ok: false, code: 'no_attempt' }
    return {
      ok: true,
      status: 'already_claimed',
      attempt: { id: mine.id, score: mine.score, passed: mine.passed, isOfficial: mine.is_official },
      ...base,
    }
  }

  // The user's own official attempt always wins; otherwise the guest's
  // official one (the earliest) becomes theirs, extra rows are practice.
  const officialGuestId = ownOfficial ? null : (toClaim.find((r) => r.is_official)?.id ?? null)

  // Returns how many rows this call actually attached (0 = lost a race).
  const attach = async (id: string, official: boolean) => {
    const { data, error } = await admin
      .from('challenge_attempts')
      .update({ user_id: userId, is_official: official })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('user_id', null)
      .select('id')
    return { error, count: data?.length ?? 0 }
  }

  for (const row of toClaim) {
    let res = await attach(row.id, row.id === officialGuestId)
    if (res.error && row.id === officialGuestId) {
      // Lost a race with the user's own official attempt (unique index):
      // keep the row, as practice.
      res = await attach(row.id, false)
    }
    if (res.error) console.error('Failed to claim challenge attempt:', res.error)
  }

  // Report what is actually stored now, not the pre-update snapshot.
  const { data: finalRows } = await admin
    .from('challenge_attempts')
    .select(cols)
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exerciseId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  const mine = (finalRows ?? []) as Row[]
  const shown = mine.find((r) => r.is_official) ?? mine[0]
  if (!shown) return { ok: false, code: 'claim_failed' }

  return {
    ok: true,
    status: 'claimed',
    attempt: { id: shown.id, score: shown.score, passed: shown.passed, isOfficial: shown.is_official },
    ...base,
  }
}

/** First published exercise of the same course after `exerciseId`, tenant-scoped. */
export async function findNextExercise(
  admin: SupabaseClient,
  tenantId: string,
  courseId: number,
  exerciseId: number,
): Promise<number | null> {
  const { data } = await admin
    .from('exercises')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('course_id', courseId)
    .eq('status', 'published')
    .gt('id', exerciseId)
    .order('id', { ascending: true })
    .limit(1)
  return (data?.[0]?.id as number | undefined) ?? null
}
