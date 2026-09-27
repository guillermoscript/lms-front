import { describe, expect, it } from 'vitest'
import {
  communityNotificationHref,
  communityNotificationMessage,
  communityNotificationSnippet,
  deriveUnreadCounts,
  formatBadgeCount,
  parseCommunityNotificationMeta,
  type CommunityNotificationMeta,
  type ViewerRole,
} from '@/lib/community/notifications'

/**
 * Issue #870 — how the web reads a community notification. Who gets one, the
 * batching and the retraction are SQL (tests/sql/issue-870-community-
 * notifications.sql); these pin the metadata contract, the deep link per role
 * and the message chosen for each state of a row.
 */

const POST = '11111111-1111-4111-8111-111111111111'
const COMMENT = '22222222-2222-4222-8222-222222222222'
const ACTOR = '33333333-3333-4333-8333-333333333333'

/** What the reply trigger writes for a first reply on a course post. */
function replyMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'community_reply',
    post_id: POST,
    course_id: 2001,
    lesson_id: null,
    comment_id: COMMENT,
    count: 1,
    actor_id: ACTOR,
    actor_name: 'QA Replier',
    actor_role: 'student',
    reply_to: 'post',
    snippet: 'Try a while loop',
    post_label: 'Help with loops',
    staff_reply: false,
    ...overrides,
  }
}

function parsed(metadata: Record<string, unknown>): CommunityNotificationMeta {
  const meta = parseCommunityNotificationMeta(metadata)
  if (!meta) throw new Error('expected metadata to parse')
  return meta
}

describe('parseCommunityNotificationMeta', () => {
  it('reads a reply', () => {
    expect(parseCommunityNotificationMeta(replyMetadata())).toEqual({
      kind: 'community_reply',
      postId: POST,
      courseId: 2001,
      lessonId: null,
      postLabel: 'Help with loops',
      actorId: ACTOR,
      actorName: 'QA Replier',
      actorRole: 'student',
      commentId: COMMENT,
      count: 1,
      replyTo: 'post',
      snippet: 'Try a while loop',
      staffReply: false,
    })
  })

  it('reads a prompt', () => {
    expect(
      parseCommunityNotificationMeta({
        kind: 'community_prompt',
        post_id: POST,
        course_id: 2001,
        lesson_id: 12,
        actor_id: ACTOR,
        actor_name: 'Teacher',
        actor_role: 'teacher',
        post_label: 'Week 1',
        course_title: 'Python for Beginners',
      })
    ).toMatchObject({ kind: 'community_prompt', lessonId: 12, courseTitle: 'Python for Beginners', actorRole: 'teacher' })
  })

  it('reads an accepted answer', () => {
    expect(
      parseCommunityNotificationMeta({ kind: 'community_answer_accepted', post_id: POST, comment_id: COMMENT, course_id: null })
    ).toMatchObject({ kind: 'community_answer_accepted', commentId: COMMENT, courseId: null })
  })

  it('reads a scrubbed reply (the latest one was taken back)', () => {
    const meta = parsed({ kind: 'community_reply', post_id: POST, course_id: 2001, count: 2, post_label: 'Help with loops' })
    expect(meta).toMatchObject({ commentId: null, actorId: null, actorName: null, snippet: null, replyTo: null, count: 2 })
  })

  it('coerces the count to an integer of at least 1', () => {
    expect(parsed(replyMetadata({ count: '3' }))).toMatchObject({ count: 3 })
    expect(parsed(replyMetadata({ count: 0 }))).toMatchObject({ count: 1 })
    expect(parsed(replyMetadata({ count: 'many' }))).toMatchObject({ count: 1 })
    expect(parsed(replyMetadata({ count: 2.7 }))).toMatchObject({ count: 2 })
  })

  it('rejects rows that are not community metadata', () => {
    expect(parseCommunityNotificationMeta(null)).toBeNull()
    expect(parseCommunityNotificationMeta('community_reply')).toBeNull()
    expect(parseCommunityNotificationMeta([replyMetadata()])).toBeNull()
    expect(parseCommunityNotificationMeta({ kind: 'daily_digest', post_id: POST })).toBeNull()
    expect(parseCommunityNotificationMeta(replyMetadata({ kind: 'community_mention' }))).toBeNull()
  })

  it('rejects malformed ids instead of building a broken link', () => {
    expect(parseCommunityNotificationMeta(replyMetadata({ post_id: undefined }))).toBeNull()
    expect(parseCommunityNotificationMeta(replyMetadata({ post_id: 'not-a-uuid' }))).toBeNull()
    expect(parseCommunityNotificationMeta(replyMetadata({ comment_id: '../../admin' }))).toBeNull()
    expect(parseCommunityNotificationMeta(replyMetadata({ actor_id: 42 }))).toBeNull()
    expect(parseCommunityNotificationMeta(replyMetadata({ course_id: 0 }))).toBeNull()
    expect(parseCommunityNotificationMeta(replyMetadata({ course_id: -3 }))).toBeNull()
    expect(parseCommunityNotificationMeta(replyMetadata({ course_id: '12abc' }))).toBeNull()
    expect(parseCommunityNotificationMeta(replyMetadata({ lesson_id: 1.5 }))).toBeNull()
  })

  it('ignores an unknown actor role and a non-boolean staff flag', () => {
    expect(parsed(replyMetadata({ actor_role: 'owner', staff_reply: 'true' }))).toMatchObject({
      actorRole: null,
      staffReply: false,
    })
  })
})

describe('communityNotificationHref', () => {
  const coursePost = parsed(replyMetadata())
  const schoolPost = parsed(replyMetadata({ course_id: null }))
  const coursePostNoComment = parsed(replyMetadata({ comment_id: null }))
  const schoolPostNoComment = parsed(replyMetadata({ course_id: null, comment_id: null }))

  const cases: Array<[ViewerRole, CommunityNotificationMeta, string]> = [
    ['student', coursePost, `/dashboard/student/courses/2001/community?post=${POST}#comment-${COMMENT}`],
    ['student', coursePostNoComment, `/dashboard/student/courses/2001/community?post=${POST}`],
    ['student', schoolPost, `/dashboard/student/community?post=${POST}#comment-${COMMENT}`],
    ['student', schoolPostNoComment, `/dashboard/student/community?post=${POST}`],
    ['teacher', coursePost, `/dashboard/teacher/courses/2001/community?post=${POST}#comment-${COMMENT}`],
    ['teacher', coursePostNoComment, `/dashboard/teacher/courses/2001/community?post=${POST}`],
    ['teacher', schoolPost, `/dashboard/teacher/community?post=${POST}#comment-${COMMENT}`],
    ['teacher', schoolPostNoComment, `/dashboard/teacher/community?post=${POST}`],
    ['admin', coursePost, `/dashboard/teacher/courses/2001/community?post=${POST}#comment-${COMMENT}`],
    ['admin', coursePostNoComment, `/dashboard/teacher/courses/2001/community?post=${POST}`],
    ['admin', schoolPost, `/dashboard/admin/community?post=${POST}#comment-${COMMENT}`],
    ['admin', schoolPostNoComment, `/dashboard/admin/community?post=${POST}`],
  ]

  it.each(cases)('%s → %s', (role, meta, expected) => {
    expect(communityNotificationHref(meta, role)).toBe(expected)
  })

  it('opens a prompt at the post, never at a comment', () => {
    const prompt = parsed({ kind: 'community_prompt', post_id: POST, course_id: 2001, comment_id: COMMENT })
    expect(communityNotificationHref(prompt, 'student')).toBe(`/dashboard/student/courses/2001/community?post=${POST}`)
  })

  it('returns null without a role or with an id that is not safe to put in a URL', () => {
    expect(communityNotificationHref(coursePost, null)).toBeNull()
    expect(communityNotificationHref({ ...coursePost, postId: 'x"><script>' }, 'student')).toBeNull()
    expect(communityNotificationHref({ ...coursePost, courseId: -1 }, 'student')).toBeNull()
    // A bad comment id drops only the anchor.
    expect(communityNotificationHref({ ...coursePost, commentId: 'nope' } as CommunityNotificationMeta, 'student')).toBe(
      `/dashboard/student/courses/2001/community?post=${POST}`
    )
  })
})

describe('communityNotificationMessage', () => {
  it('names the replier on a first reply to a post', () => {
    expect(communityNotificationMessage(parsed(replyMetadata()), 'Someone')).toEqual({
      key: 'replyToPost',
      values: { name: 'QA Replier' },
    })
  })

  it('names the replier on a first reply to a comment', () => {
    expect(communityNotificationMessage(parsed(replyMetadata({ reply_to: 'comment' })), 'Someone')).toEqual({
      key: 'replyToComment',
      values: { name: 'QA Replier' },
    })
  })

  it('counts a batch', () => {
    expect(communityNotificationMessage(parsed(replyMetadata({ count: 5 })), 'Someone')).toEqual({
      key: 'replies',
      values: { count: 5 },
    })
  })

  it('keeps the same copy for a staff reply (the badge carries the role)', () => {
    const meta = parsed(replyMetadata({ actor_role: 'teacher', staff_reply: true }))
    expect(communityNotificationMessage(meta, 'Someone').key).toBe('replyToPost')
  })

  it('falls back to the unknown-actor name when the replier has none', () => {
    expect(communityNotificationMessage(parsed(replyMetadata({ actor_name: null })), 'Someone')).toEqual({
      key: 'replyToPost',
      values: { name: 'Someone' },
    })
  })

  it('shows a count, not a name, once the only named reply was taken back', () => {
    const meta = parsed({ kind: 'community_reply', post_id: POST, course_id: 2001, count: 1, post_label: 'Help' })
    expect(communityNotificationMessage(meta, 'Someone')).toEqual({ key: 'replies', values: { count: 1 } })
  })

  it('names the course of a prompt, when known', () => {
    const withCourse = parsed({ kind: 'community_prompt', post_id: POST, course_id: 2001, course_title: 'Python' })
    const withoutCourse = parsed({ kind: 'community_prompt', post_id: POST, course_id: 2001 })
    expect(communityNotificationMessage(withCourse, 'Someone')).toEqual({ key: 'prompt', values: { course: 'Python' } })
    expect(communityNotificationMessage(withoutCourse, 'Someone')).toEqual({ key: 'promptNoCourse', values: {} })
  })

  it('announces an accepted answer', () => {
    const meta = parsed({ kind: 'community_answer_accepted', post_id: POST, comment_id: COMMENT })
    expect(communityNotificationMessage(meta, 'Someone')).toEqual({ key: 'answerAccepted', values: {} })
  })
})

describe('communityNotificationSnippet', () => {
  it('quotes the latest reply with its author', () => {
    expect(communityNotificationSnippet(parsed(replyMetadata({ count: 3 })), 'Someone')).toEqual({
      name: 'QA Replier',
      snippet: 'Try a while loop',
    })
  })

  it('shows nothing for a scrubbed reply, a prompt or an accepted answer', () => {
    expect(
      communityNotificationSnippet(parsed({ kind: 'community_reply', post_id: POST, count: 2, snippet: 'leftover' }), 'Someone')
    ).toBeNull()
    expect(communityNotificationSnippet(parsed({ kind: 'community_prompt', post_id: POST }), 'Someone')).toBeNull()
    expect(
      communityNotificationSnippet(
        parsed({ kind: 'community_answer_accepted', post_id: POST, comment_id: COMMENT, snippet: 'mine', actor_id: ACTOR }),
        'Someone'
      )
    ).toBeNull()
  })
})

describe('deriveUnreadCounts', () => {
  it('counts every unread row and the community ones apart', () => {
    expect(
      deriveUnreadCounts([
        { notification: { notification_type: 'community' } },
        { notification: [{ notification_type: 'community' }] },
        { notification: { notification_type: 'info' } },
        { notification: null },
      ])
    ).toEqual({ unread: 3, community: 2 })
  })

  it('is zero for nothing', () => {
    expect(deriveUnreadCounts([])).toEqual({ unread: 0, community: 0 })
    expect(deriveUnreadCounts(null)).toEqual({ unread: 0, community: 0 })
  })
})

describe('formatBadgeCount', () => {
  it('caps at 99+', () => {
    expect(formatBadgeCount(1)).toBe('1')
    expect(formatBadgeCount(99)).toBe('99')
    expect(formatBadgeCount(100)).toBe('99+')
  })
})
