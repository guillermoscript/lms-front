/**
 * Deep links into a community feed (#869).
 *
 * The contract other features build on (notifications, #870):
 *
 *   /dashboard/{student|teacher}/courses/<id>/community?post=<uuid>#comment-<uuid>
 *   /dashboard/{student|teacher|admin}/community?post=<uuid>
 *
 * `?post=` scrolls to that post, opens its comments and highlights it — fetched
 * on its own when it is not on the first page. `#comment-` then scrolls to one
 * comment inside it. Pure and client-safe: the pages parse on the server, the
 * feed reads the hash on the client.
 */

import type { CommunityPost } from '@/components/community/community-feed'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The `?post=` value as a post id, or null. Only a UUID gets through — the
 * value goes into a PostgREST filter, and anything else is a 22P02 there.
 */
export function parsePostParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && UUID.test(value) ? value.toLowerCase() : null
}

/**
 * `#comment-<uuid>` as a comment id, or null. Only the last fragment counts: a
 * router.push that changes nothing but the hash makes Next's production router
 * append the new hash to the old one (`#comment-A#comment-B`), and B is the target.
 */
export function parseCommentHash(hash: string | null | undefined): string | null {
  const match = /^comment-(.+)$/.exec((hash ?? '').split('#').pop() ?? '')
  return match && UUID.test(match[1]) ? match[1].toLowerCase() : null
}

export function postAnchorId(postId: string): string {
  return `post-${postId}`
}

export function commentAnchorId(commentId: string): string {
  return `comment-${commentId}`
}

/** A student's course feed, focused on one post (and one of its comments). */
export function studentCourseFeedHref(courseId: number, postId: string, commentId?: string | null): string {
  const base = `/dashboard/student/courses/${courseId}/community?post=${postId}`
  return commentId ? `${base}#${commentAnchorId(commentId)}` : base
}

/**
 * Where the focused post goes in the feed. On the first page it stays where
 * it is (`focused` is null); otherwise it leads the feed and is dropped from
 * the pages loaded after it, so it never shows twice. The pagination cursor
 * comes from the timeline only — the focused post's date says nothing about
 * where page 2 starts.
 */
export function splitFocusedPost({
  focusPost,
  initialPosts,
  extraPosts,
}: {
  focusPost: CommunityPost | null | undefined
  initialPosts: CommunityPost[]
  extraPosts: CommunityPost[]
}): { focused: CommunityPost | null; timeline: CommunityPost[]; cursorPost: CommunityPost | null } {
  const focused = focusPost && !initialPosts.some((p) => p.id === focusPost.id) ? focusPost : null
  const all = [...initialPosts, ...extraPosts]
  const timeline = focused ? all.filter((p) => p.id !== focused.id) : all
  return { focused, timeline, cursorPost: timeline[timeline.length - 1] ?? null }
}

/** Smooth scrolling, unless the reader asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || !window.matchMedia) return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
