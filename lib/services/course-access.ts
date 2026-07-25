/**
 * Course Access — DB access layer for the entitlements model.
 *
 * Thin wrappers over the `entitlements` table and the `has_course_access()`
 * RPC. Pure compute lives in lib/services/enrollment-service.ts.
 * See docs/ENTITLEMENTS_MIGRATION_PLAN.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeCourseAccess,
  type CourseAccess,
  type EntitlementRow,
} from './enrollment-service'

const ENTITLEMENT_COLUMNS =
  'entitlement_id, course_id, source_type, source_id, status, granted_at, expires_at'

/**
 * Boolean access gate for a single user + course.
 * Uses the has_course_access() SECURITY DEFINER RPC.
 */
export async function hasCourseAccess(
  supabase: SupabaseClient,
  userId: string,
  courseId: number,
): Promise<boolean> {
  const { data } = await supabase.rpc('has_course_access', {
    _user_id: userId,
    _course_id: courseId,
  })
  return data === true
}

/**
 * Why access was granted or refused.
 *
 * `has_course_access()` collapses every refusal into a bare `false`, so a
 * school past its `tenants.access_cutoff_at` (issue #494) is indistinguishable
 * from a student who simply never bought the course. Telling those apart is
 * what lets the UI say "your school's access is suspended" instead of quietly
 * bouncing a paying student back to the dashboard.
 */
export type CourseAccessState = 'granted' | 'suspended' | 'denied'

/**
 * Access gate with a reason. Costs one extra query only on the refusal path.
 *
 * An active, unexpired entitlement that `has_course_access()` still refuses
 * can only have been refused by the tenant-wide access cutoff — that is the
 * one condition the RPC checks and this query doesn't.
 */
export async function resolveCourseAccessState(
  supabase: SupabaseClient,
  userId: string,
  courseId: number,
): Promise<CourseAccessState> {
  if (await hasCourseAccess(supabase, userId, courseId)) return 'granted'

  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('entitlements')
    .select('entitlement_id, expires_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'active')

  const rows = (data ?? []) as Array<{ expires_at: string | null }>
  const hasLiveEntitlement = rows.some((r) => !r.expires_at || r.expires_at > nowIso)

  return hasLiveEntitlement ? 'suspended' : 'denied'
}

/**
 * Full access detail (type, expiry, all sources) for one user + course.
 */
export async function fetchCourseAccess(
  supabase: SupabaseClient,
  userId: string,
  courseId: number,
): Promise<CourseAccess> {
  const { data } = await supabase
    .from('entitlements')
    .select(ENTITLEMENT_COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', courseId)
  return computeCourseAccess((data ?? []) as EntitlementRow[])
}

/**
 * The set of course_ids the user currently has active (non-expired) access to.
 * Handy for "already enrolled" checks on listing pages.
 */
export async function fetchAccessibleCourseIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<number>> {
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('entitlements')
    .select('course_id, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')

  const ids = new Set<number>()
  for (const row of (data ?? []) as Array<{ course_id: number; expires_at: string | null }>) {
    if (!row.expires_at || row.expires_at > nowIso) ids.add(row.course_id)
  }
  return ids
}

/**
 * Access detail for many courses at once (one query). Returns a map keyed by
 * course_id; courses with no entitlement are simply absent.
 */
export async function fetchCourseAccessMap(
  supabase: SupabaseClient,
  userId: string,
  courseIds: number[],
): Promise<Map<number, CourseAccess>> {
  const result = new Map<number, CourseAccess>()
  if (courseIds.length === 0) return result

  const { data } = await supabase
    .from('entitlements')
    .select(ENTITLEMENT_COLUMNS)
    .eq('user_id', userId)
    .in('course_id', courseIds)

  const byCourse = new Map<number, EntitlementRow[]>()
  for (const row of (data ?? []) as EntitlementRow[]) {
    const list = byCourse.get(row.course_id as number) ?? []
    list.push(row)
    byCourse.set(row.course_id as number, list)
  }
  for (const [courseId, rows] of byCourse) {
    result.set(courseId, computeCourseAccess(rows))
  }
  return result
}
