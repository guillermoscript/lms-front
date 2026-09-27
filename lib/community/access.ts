import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { readBlockedAuthorIds } from '@/lib/community/blocks'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'

/**
 * Entry points into the course communities (#868): is the community on, what
 * is happening in a course feed, which course feeds a student can open, and
 * who may pin in one.
 *
 * Reads with the service role, so the CALLER owns the access decision, as with
 * `getFeedPage`: the viewer belongs to `tenantId` and, for anything about one
 * course, has already passed `requireCourseAccess` (students) or the
 * owner/admin gate (staff). The service role is deliberate — the course-post
 * RLS SELECT still keys on `enrollments`, while the feed a link opens reads
 * with `getFeedPage` on the entitlements model. Reading the hint the same way
 * keeps "No posts yet" from lying to an entitled student who never enrolled.
 *
 * Server-only. Client components get hrefs and strings as props instead.
 */

export const COMMUNITY_ACTIVITY_WINDOW_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Does the tenant's plan include the community? The same gate as RLS
 * `community_can_write` and as the course feed pages' `get_plan_features`
 * check (both filter `is_active` and fall back to free) — which is why this is
 * not `hasPlanFeature`, whose read ignores `is_active` and could show a link
 * to a page that then renders the upgrade nudge.
 *
 * Closed by default: an error hides the entry points. Never throws, so a page
 * can start it early and await it late.
 */
export const isCommunityEnabled = cache(async (tenantId: string): Promise<boolean> => {
  try {
    const { data, error } = await createAdminClient().rpc('community_enabled', { _tenant_id: tenantId })
    if (error) {
      console.error('community_enabled failed:', error.message)
      return false
    }
    return data === true
  } catch (err) {
    console.error('community_enabled failed:', err)
    return false
  }
})

/**
 * A post as one line of text, or `null` when there is nothing to quote.
 * Milestones are system posts rendered from `milestone_data`; their `content`
 * is not something a person wrote, so they are never quoted.
 */
export function communityPostLabel(
  post: { post_type: string; title: string | null; content: string | null },
  max = 80
): string | null {
  if (post.post_type === 'milestone') return null
  const text = (post.title?.trim() || post.content || '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length <= max) return text

  const cut = text.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  // Break on a word unless that would throw away more than half the budget
  // (one very long word).
  const head = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut
  return `${head.replace(/[\s,;:.–—-]+$/, '')}…`
}

export type CourseCommunityActivity = {
  /** Visible posts in the last `COMMUNITY_ACTIVITY_WINDOW_DAYS` days. */
  recentCount: number
  /** The newest visible post, whenever it was written. */
  latest: { id: string; label: string | null } | null
}

export type CourseActivityHint =
  | { kind: 'unknown' }
  | { kind: 'empty' }
  | { kind: 'recent'; count: number; label: string | null }
  | { kind: 'latest'; label: string }

/**
 * What the course page may say about its feed. "Empty" only when both reads
 * succeeded and found nothing: a failed read is `unknown`, which the UI
 * renders as a neutral invitation rather than as "No posts yet"
 * (PRODUCT.md principle 5).
 */
export function courseActivityHint(activity: CourseCommunityActivity | null): CourseActivityHint {
  if (activity === null) return { kind: 'unknown' }
  if (activity.latest === null && activity.recentCount === 0) return { kind: 'empty' }
  if (activity.recentCount > 0) {
    return { kind: 'recent', count: activity.recentCount, label: activity.latest?.label ?? null }
  }
  const label = activity.latest?.label ?? null
  return label ? { kind: 'latest', label } : { kind: 'unknown' }
}

export type CourseCommunityEntry =
  | { enabled: false }
  | { enabled: true; activity: CourseCommunityActivity | null }

/**
 * Everything the course page needs for its Community entry: whether to show
 * it, and the activity behind the hint. The viewer must already have passed
 * `requireCourseAccess` for `courseId`.
 *
 * Counts what the viewer would see on the feed: hidden posts and the authors
 * they blocked are left out, exactly as `getFeedPage` does. `activity` is
 * `null` when anything needed for that (blocks included) could not be read.
 * Never throws.
 */
export async function loadCourseCommunityEntry({
  tenantId,
  viewerId,
  courseId,
  now = new Date(),
}: {
  tenantId: string
  viewerId: string
  courseId: number
  now?: Date
}): Promise<CourseCommunityEntry> {
  const [enabled, blockedIds] = await Promise.all([
    isCommunityEnabled(tenantId),
    // Fails closed: a hint that ignored the blocks could quote a blocked author.
    readBlockedAuthorIds(viewerId).catch((err: unknown) => {
      console.error('course community entry: blocks read failed:', err)
      return null
    }),
  ])
  if (!enabled) return { enabled: false }
  if (blockedIds === null) return { enabled: true, activity: null }

  try {
    const admin = createAdminClient()
    const since = new Date(now.getTime() - COMMUNITY_ACTIVITY_WINDOW_DAYS * DAY_MS).toISOString()

    // Both ride idx_community_posts_course_feed (tenant_id, course_id, created_at DESC).
    let countQuery = admin
      .from('community_posts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)
      .eq('is_hidden', false)
      .gte('created_at', since)
    let latestQuery = admin
      .from('community_posts')
      .select('id, post_type, title, content, created_at')
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)
      .eq('is_hidden', false)

    if (blockedIds.length > 0) {
      const blocked = `(${blockedIds.join(',')})`
      countQuery = countQuery.not('author_id', 'in', blocked)
      latestQuery = latestQuery.not('author_id', 'in', blocked)
    }

    const [countRes, latestRes] = await Promise.all([
      countQuery,
      latestQuery.order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    if (countRes.error || latestRes.error || countRes.count === null) {
      console.error('course community entry: activity read failed:', countRes.error ?? latestRes.error)
      return { enabled: true, activity: null }
    }

    const latest = latestRes.data
      ? { id: latestRes.data.id as string, label: communityPostLabel(latestRes.data) }
      : null
    return { enabled: true, activity: { recentCount: countRes.count, latest } }
  } catch (err) {
    console.error('course community entry: activity read failed:', err)
    return { enabled: true, activity: null }
  }
}

/**
 * Does the course feed have any visible post? `null` when it could not be
 * told, which callers read as "don't offer". Not filtered by the viewer's
 * blocks: it is about the feed, not about what one person sees of it.
 */
export async function hasVisibleCoursePosts({
  tenantId,
  courseId,
}: {
  tenantId: string
  courseId: number
}): Promise<boolean | null> {
  try {
    const { count, error } = await createAdminClient()
      .from('community_posts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)
      .eq('is_hidden', false)
    if (error || count === null) {
      if (error) console.error('course feed post count failed:', error.message)
      return null
    }
    return count > 0
  } catch (err) {
    console.error('course feed post count failed:', err)
    return null
  }
}

/**
 * The courses a student's entitlements open right now. A TypeScript mirror of
 * `has_course_access()` (`20260724130000_access_cutoff_enforcement.sql`), for
 * listing many courses at once instead of one RPC per course: `rows` are the
 * user's ACTIVE entitlements in the tenant; an entitlement counts while
 * `expires_at` is NULL or in the future; a tenant past its `access_cutoff_at`
 * opens nothing. Keep the two in step.
 */
export function liveEntitledCourseIds(
  rows: { course_id: number; expires_at: string | null }[],
  cutoffAt: string | null,
  now: Date
): number[] {
  if (cutoffAt && new Date(cutoffAt).getTime() <= now.getTime()) return []
  const ids = new Set<number>()
  for (const row of rows) {
    if (row.expires_at === null || new Date(row.expires_at).getTime() > now.getTime()) ids.add(row.course_id)
  }
  return [...ids]
}

export type CommunityCourse = { courseId: number; title: string }

/**
 * Every course whose feed the student can open, for the school feed's list of
 * course communities: enrolled courses first (the ones they are actually
 * taking), then by title. Enrollments only order the list; access is the
 * entitlements mirror above. `[]` on any error — the list is a shortcut, and
 * the school feed must not fail over it.
 */
export async function getCommunityCourses({
  tenantId,
  userId,
  now = new Date(),
}: {
  tenantId: string
  userId: string
  now?: Date
}): Promise<CommunityCourse[]> {
  try {
    const admin = createAdminClient()
    const [entitlements, tenantRes, enrollments] = await Promise.all([
      fetchAllRows<{ entitlement_id: number; course_id: number; expires_at: string | null }>(
        'entitlements',
        (from, to) =>
          admin
            .from('entitlements')
            .select('entitlement_id, course_id, expires_at', { count: 'exact' })
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .order('entitlement_id')
            .range(from, to)
      ),
      admin.from('tenants').select('access_cutoff_at').eq('id', tenantId).maybeSingle(),
      fetchAllRows<{ enrollment_id: number; course_id: number }>('enrollments', (from, to) =>
        admin
          .from('enrollments')
          .select('enrollment_id, course_id', { count: 'exact' })
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
          .order('enrollment_id')
          .range(from, to)
      ),
    ])
    if (tenantRes.error) throw tenantRes.error

    const ids = liveEntitledCourseIds(entitlements, tenantRes.data?.access_cutoff_at ?? null, now)
    if (ids.length === 0) return []

    const courses = await fetchAllRowsIn<{ course_id: number; title: string }, number>(
      'courses',
      ids,
      (chunk, from, to) =>
        admin
          .from('courses')
          .select('course_id, title', { count: 'exact' })
          .in('course_id', chunk)
          .eq('tenant_id', tenantId)
          .order('course_id')
          .range(from, to)
    )

    const enrolled = new Set(enrollments.map((e) => e.course_id))
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
    return courses
      .map((c) => ({ courseId: c.course_id, title: c.title }))
      .sort(
        (a, b) =>
          Number(enrolled.has(b.courseId)) - Number(enrolled.has(a.courseId)) || collator.compare(a.title, b.title)
      )
  } catch (err) {
    console.error('community courses read failed:', err)
    return []
  }
}

/**
 * May this member pin posts in the course's feed? Admins anywhere in the
 * school; teachers in the courses they author. The caller has already
 * established that the course (or the post in it) belongs to `tenantId`.
 */
export async function canPinInCourse({
  tenantId,
  userId,
  role,
  courseId,
}: {
  tenantId: string
  userId: string
  role: string | null
  courseId: number
}): Promise<boolean> {
  if (role === 'admin') return true
  if (role !== 'teacher') return false

  const { data, error } = await createAdminClient()
    .from('courses')
    .select('author_id')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('course author read failed:', error.message)
    return false
  }
  return data?.author_id === userId
}
