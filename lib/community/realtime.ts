/**
 * The live community feed (#876). Pure and client-safe; the subscription
 * itself is `useRealtimeInserts` (hooks/use-realtime-inserts.ts).
 *
 * Security model — three layers, none of them the payload:
 *
 *   1. Realtime Postgres Changes runs every event through the subscriber's RLS
 *      (JWT tenant, course enrollment, blocks, is_hidden). Another school's or
 *      another course's rows are never delivered.
 *   2. Each channel is narrowed by a filter built here: the school feed by
 *      tenant_id, a course feed by course_id (one course, one school), a thread
 *      by post_id. A super admin — whom RLS lets read every school — still only
 *      hears the feed on screen.
 *   3. An event is only a signal. The feed re-reads through the same server
 *      path as its first page (`loadNewPosts` → getFeedPage), the thread through
 *      `getComments`; the row in the payload is never rendered.
 */

import type { CommunityPost } from '@/components/community/community-feed'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Debounce for bursts of events (a teacher posting a batch). */
export const REALTIME_DEBOUNCE_MS = 400

/**
 * The Postgres Changes filter for a feed's new posts, or null when the ids are
 * not usable — then the feed simply does not go live, it never widens.
 */
export function feedInsertFilter({
  scope,
  tenantId,
  courseId,
}: {
  scope: 'school' | 'course'
  tenantId: string | null | undefined
  courseId?: number | null
}): string | null {
  if (scope === 'course') {
    return typeof courseId === 'number' && Number.isSafeInteger(courseId) && courseId > 0
      ? `course_id=eq.${courseId}`
      : null
  }
  return tenantId && UUID.test(tenantId) ? `tenant_id=eq.${tenantId.toLowerCase()}` : null
}

/** The filter for a thread's new comments, or null for a malformed id. */
export function threadInsertFilter(postId: string | null | undefined): string | null {
  return postId && UUID.test(postId) ? `post_id=eq.${postId.toLowerCase()}` : null
}

interface InsertedRow {
  id?: unknown
  author_id?: unknown
  course_id?: unknown
  tenant_id?: unknown
}

/**
 * Whether a realtime INSERT on community_posts is worth a re-read for this
 * feed: someone else's post, in this feed. The viewer's own posts arrive
 * through `router.refresh()` after posting; the school feed ignores course
 * posts (the tenant filter can not tell them apart).
 */
export function isFeedInsertSignal(
  row: unknown,
  { scope, courseId, viewerId }: { scope: 'school' | 'course'; courseId?: number | null; viewerId: string }
): boolean {
  if (!row || typeof row !== 'object') return false
  const r = row as InsertedRow
  if (typeof r.id !== 'string' || !UUID.test(r.id)) return false
  if (r.author_id === viewerId) return false
  if (scope === 'school') return r.course_id === null || r.course_id === undefined
  return r.course_id === courseId
}

/** Whether a realtime INSERT on community_comments should reload the thread. */
export function isThreadInsertSignal(row: unknown, { postId, viewerId }: { postId: string; viewerId: string }): boolean {
  if (!row || typeof row !== 'object') return false
  const r = row as InsertedRow & { post_id?: unknown }
  if (typeof r.id !== 'string') return false
  if (r.author_id === viewerId) return false
  return typeof r.post_id !== 'string' || r.post_id.toLowerCase() === postId.toLowerCase()
}

/** The newest `created_at` among the posts, or null for none. */
export function newestCreatedAt(posts: Array<Pick<CommunityPost, 'created_at'> | null | undefined>): string | null {
  let newest: string | null = null
  let newestMs = -Infinity
  for (const p of posts) {
    if (!p) continue
    const ms = Date.parse(p.created_at)
    if (Number.isFinite(ms) && ms > newestMs) {
      newestMs = ms
      newest = p.created_at
    }
  }
  return newest
}

/**
 * The posts waiting behind the "N new posts" pill after a re-read: what was
 * already waiting plus what just arrived, minus anything already on screen
 * and the viewer's own, newest first, each once.
 */
export function mergePendingPosts(
  pending: CommunityPost[],
  incoming: CommunityPost[],
  { shownIds, viewerId }: { shownIds: ReadonlySet<string>; viewerId: string }
): CommunityPost[] {
  const byId = new Map<string, CommunityPost>()
  for (const p of [...incoming, ...pending]) {
    if (shownIds.has(p.id) || p.author_id === viewerId || byId.has(p.id)) continue
    byId.set(p.id, p)
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

/**
 * Posts shown live (after the pill was pressed) that the server's first page
 * does not already hold — after a `router.refresh()` the page catches up and
 * they must not show twice.
 */
export function unseenLivePosts(livePosts: CommunityPost[], initialPosts: CommunityPost[]): CommunityPost[] {
  if (livePosts.length === 0) return livePosts
  const initial = new Set(initialPosts.map((p) => p.id))
  return livePosts.filter((p) => !initial.has(p.id))
}
