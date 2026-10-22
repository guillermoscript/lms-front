/**
 * Course Access — DB access layer for the entitlements model.
 *
 * Thin wrappers over the `entitlements` table and the `has_course_access()`
 * RPC. Pure compute lives in lib/services/enrollment-service.ts.
 * See docs/ENTITLEMENTS_MIGRATION_PLAN.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'
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
 * Handy for "already enrolled" checks on listing pages. Pass `tenantId` to
 * scope to one school (a user can belong to several).
 */
export async function fetchAccessibleCourseIds(
  supabase: SupabaseClient,
  userId: string,
  tenantId?: string,
): Promise<Set<number>> {
  const nowIso = new Date().toISOString()
  let query = supabase
    .from('entitlements')
    .select('course_id, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await query

  const ids = new Set<number>()
  for (const row of (data ?? []) as Array<{ course_id: number; expires_at: string | null }>) {
    if (!row.expires_at || row.expires_at > nowIso) ids.add(row.course_id)
  }
  return ids
}

/** Key for a (user, course) pair in the set returned by `fetchLiveEntitlementKeys`. */
export function liveEntitlementKey(userId: string, courseId: number): string {
  return `${userId}:${courseId}`
}

/**
 * Every (user, course) pair in a school that currently has a LIVE entitlement
 * (status 'active' AND not past `expires_at`), as `liveEntitlementKey` strings.
 *
 * Use this — not `enrollments.status = 'active'` — whenever a list, count or
 * recipient set means "people who can open the course": `enrollments` is
 * learning progress only and can lag behind an expiry that passes in time.
 * Narrow with `courseIds` (a teacher's courses, one course) or `userId`.
 * Complete reads (paged), so it is safe past PostgREST's 1000-row cap; throws
 * on a read error rather than returning a short set.
 */
export async function fetchLiveEntitlementKeys(
  supabase: SupabaseClient,
  tenantId: string,
  scope: { courseIds?: number[]; userId?: string } = {},
): Promise<Set<string>> {
  const nowIso = new Date().toISOString()
  type Row = { entitlement_id: number; user_id: string; course_id: number }

  const base = () => {
    let q = supabase
      .from('entitlements')
      .select('entitlement_id, user_id, course_id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    if (scope.userId) q = q.eq('user_id', scope.userId)
    return q
  }

  const rows: Row[] = scope.courseIds
    ? await fetchAllRowsIn<Row, number>('entitlements', scope.courseIds, (chunk, from, to) =>
        base().in('course_id', chunk).order('entitlement_id').range(from, to),
      )
    : await fetchAllRows<Row>('entitlements', (from, to) =>
        base().order('entitlement_id').range(from, to),
      )

  return new Set(rows.map((r) => liveEntitlementKey(r.user_id, r.course_id)))
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
