/**
 * Community notifications on the web (issue #870).
 *
 * The database writes them (AFTER triggers in
 * `20260928130000_community_notifications.sql`) with one
 * `notification_type = 'community'` and the event in `metadata.kind`. It stores
 * ids, not URLs: the right link depends on who is looking (a teacher cannot open
 * the student course feed — `proxy.ts` sends them away), so it is built here
 * from the ids and the viewer's role. The stored title/content are push text;
 * the web renders its own localized copy from the metadata.
 *
 * `?post=<id>` and the `#comment-<id>` anchor are consumed by the feed (#869);
 * this module only emits them.
 */

export const COMMUNITY_NOTIFICATION_TYPE = 'community'

export const COMMUNITY_NOTIFICATION_KINDS = [
  'community_reply',
  'community_prompt',
  'community_answer_accepted',
] as const

export type CommunityNotificationKind = (typeof COMMUNITY_NOTIFICATION_KINDS)[number]

export type ViewerRole = 'student' | 'teacher' | 'admin' | null

type ActorRole = 'student' | 'teacher' | 'admin'

interface CommunityNotificationBase {
  postId: string
  courseId: number | null
  lessonId: number | null
  /** The post's title, or an excerpt of it when it has none. */
  postLabel: string | null
  actorId: string | null
  actorName: string | null
  actorRole: ActorRole | null
}

export interface CommunityReplyMeta extends CommunityNotificationBase {
  kind: 'community_reply'
  /** The latest reply in the batch; null once that reply was taken back. */
  commentId: string | null
  /** Replies batched into this notification, at least 1. */
  count: number
  replyTo: 'post' | 'comment' | null
  snippet: string | null
  staffReply: boolean
}

export interface CommunityPromptMeta extends CommunityNotificationBase {
  kind: 'community_prompt'
  courseTitle: string | null
}

export interface CommunityAnswerAcceptedMeta extends CommunityNotificationBase {
  kind: 'community_answer_accepted'
  commentId: string | null
  snippet: string | null
}

export type CommunityNotificationMeta = CommunityReplyMeta | CommunityPromptMeta | CommunityAnswerAcceptedMeta

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const INVALID = Symbol('invalid')

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** A uuid, null when absent, INVALID when present but not a uuid. */
function optionalUuid(value: unknown): string | null | typeof INVALID {
  if (value === undefined || value === null) return null
  return typeof value === 'string' && UUID.test(value) ? value : INVALID
}

/** A positive integer id, null when absent, INVALID otherwise. */
function optionalId(value: unknown): number | null | typeof INVALID {
  if (value === undefined || value === null) return null
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : INVALID
}

function coerceCount(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

function actorRole(value: unknown): ActorRole | null {
  return value === 'student' || value === 'teacher' || value === 'admin' ? value : null
}

/**
 * Read a `notifications.metadata` value written by the community triggers.
 * Returns null for anything that is not one — an unknown kind, a malformed id —
 * so a bad row renders as a plain notification instead of a broken link.
 */
export function parseCommunityNotificationMeta(metadata: unknown): CommunityNotificationMeta | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const m = metadata as Record<string, unknown>
  const kind = m.kind
  if (!COMMUNITY_NOTIFICATION_KINDS.includes(kind as CommunityNotificationKind)) return null

  const postId = optionalUuid(m.post_id)
  const commentId = optionalUuid(m.comment_id)
  const actorId = optionalUuid(m.actor_id)
  const courseId = optionalId(m.course_id)
  const lessonId = optionalId(m.lesson_id)
  if (postId === null || postId === INVALID) return null
  if (commentId === INVALID || actorId === INVALID || courseId === INVALID || lessonId === INVALID) return null

  const base: CommunityNotificationBase = {
    postId,
    courseId,
    lessonId,
    postLabel: optionalString(m.post_label),
    actorId,
    actorName: optionalString(m.actor_name),
    actorRole: actorRole(m.actor_role),
  }

  switch (kind as CommunityNotificationKind) {
    case 'community_reply':
      return {
        ...base,
        kind: 'community_reply',
        commentId,
        count: coerceCount(m.count),
        replyTo: m.reply_to === 'post' || m.reply_to === 'comment' ? m.reply_to : null,
        snippet: optionalString(m.snippet),
        staffReply: m.staff_reply === true,
      }
    case 'community_prompt':
      return { ...base, kind: 'community_prompt', courseTitle: optionalString(m.course_title) }
    case 'community_answer_accepted':
      return { ...base, kind: 'community_answer_accepted', commentId, snippet: optionalString(m.snippet) }
  }
}

/**
 * Where a community notification opens, for the viewer's role — locale-less,
 * like every other dashboard link. Null when the role is unknown.
 *
 *   student         /dashboard/student/courses/<id>/community  or  /dashboard/student/community
 *   teacher, admin  /dashboard/teacher/courses/<id>/community  (the only course feed staff can open)
 *   teacher         /dashboard/teacher/community               (school post)
 *   admin           /dashboard/admin/community                 (school post)
 */
export function communityNotificationHref(meta: CommunityNotificationMeta, role: ViewerRole): string | null {
  if (!role || !UUID.test(meta.postId)) return null
  if (meta.courseId !== null && !(Number.isSafeInteger(meta.courseId) && meta.courseId > 0)) return null

  let path: string
  if (meta.courseId !== null) {
    path =
      role === 'student'
        ? `/dashboard/student/courses/${meta.courseId}/community`
        : `/dashboard/teacher/courses/${meta.courseId}/community`
  } else {
    path = `/dashboard/${role}/community`
  }

  const commentId = meta.kind === 'community_prompt' ? null : meta.commentId
  const hash = commentId && UUID.test(commentId) ? `#comment-${commentId}` : ''
  return `${path}?post=${meta.postId}${hash}`
}

export type CommunityMessageKey =
  | 'replyToPost'
  | 'replyToComment'
  | 'replies'
  | 'prompt'
  | 'promptNoCourse'
  | 'answerAccepted'

export interface CommunityMessage {
  /** Key under `community.notifications`. */
  key: CommunityMessageKey
  values: Record<string, string | number>
}

/**
 * The headline of a community notification as a message key + values, so the
 * copy stays in the catalogues. `fallbackName` stands in for an actor without a
 * name (the caller passes `community.notifications.unknownActor`).
 *
 * A batch reads "3 new replies"; a single reply names who wrote it — unless it
 * was taken back and scrubbed, which leaves a count with no actor.
 */
export function communityNotificationMessage(meta: CommunityNotificationMeta, fallbackName: string): CommunityMessage {
  switch (meta.kind) {
    case 'community_reply':
      if (meta.count > 1 || !meta.actorId) return { key: 'replies', values: { count: meta.count } }
      return {
        key: meta.replyTo === 'comment' ? 'replyToComment' : 'replyToPost',
        values: { name: meta.actorName ?? fallbackName },
      }
    case 'community_prompt':
      return meta.courseTitle
        ? { key: 'prompt', values: { course: meta.courseTitle } }
        : { key: 'promptNoCourse', values: {} }
    case 'community_answer_accepted':
      return { key: 'answerAccepted', values: {} }
  }
}

export type CommunityPostLineKey = 'onPost' | 'onYourPost' | 'onAPost'

/**
 * The line under the headline that names the post, as a key under
 * `community.notifications` + values. A post with no label — a milestone post
 * has no title and no text, and nothing else to name it by — is "your post"
 * when the reply was to the recipient's own post, else "a post"; never an
 * empty quote. None for a prompt: its headline names the course, and the
 * caller shows the prompt's own label, if any, as it is.
 */
export function communityNotificationPostLine(
  meta: CommunityNotificationMeta
): { key: CommunityPostLineKey; values: Record<string, string> } | null {
  if (meta.kind === 'community_prompt') return null
  if (meta.postLabel) return { key: 'onPost', values: { post: meta.postLabel } }
  const own = meta.kind === 'community_reply' && meta.replyTo === 'post'
  return { key: own ? 'onYourPost' : 'onAPost', values: {} }
}

/**
 * The quoted reply under the headline: the latest reply of a batch. None for a
 * prompt or an accepted answer (the headline says it all), and none once the
 * reply was taken back and scrubbed.
 */
export function communityNotificationSnippet(
  meta: CommunityNotificationMeta,
  fallbackName: string
): { name: string; snippet: string } | null {
  if (meta.kind !== 'community_reply' || !meta.snippet || !meta.actorId) return null
  return { name: meta.actorName ?? fallbackName, snippet: meta.snippet }
}

interface UnreadRow {
  notification?: { notification_type?: string | null } | Array<{ notification_type?: string | null }> | null
}

function embeddedType(row: UnreadRow): { notification_type?: string | null } | null {
  return (Array.isArray(row.notification) ? row.notification[0] : row.notification) ?? null
}

/**
 * Totals for the bell and the sidebar Community badge, from the unread rows of
 * one school (the caller filters by tenant — see notification-counts.tsx).
 *
 * Two reads, each capped: every unread row, and the community ones on their
 * own. Counting community rows inside the all-types page under-counted them
 * as soon as 100 newer unread digests or nudges pushed them out of it.
 */
export function deriveUnreadCounts(
  allRows: UnreadRow[] | null | undefined,
  communityRows: UnreadRow[] | null | undefined
): { unread: number; community: number } {
  let unread = 0
  for (const row of allRows ?? []) {
    if (embeddedType(row)) unread++
  }
  let community = 0
  for (const row of communityRows ?? []) {
    if (embeddedType(row)?.notification_type === COMMUNITY_NOTIFICATION_TYPE) community++
  }
  return { unread, community }
}

/** A badge never grows past this; `99+` above it. */
export const BADGE_CAP = 99

export function formatBadgeCount(count: number): string {
  return count > BADGE_CAP ? `${BADGE_CAP}+` : String(count)
}
