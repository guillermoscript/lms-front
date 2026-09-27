import { describe, it, expect } from 'vitest'
import {
  commentAnchorId,
  parseCommentHash,
  parsePostParam,
  postAnchorId,
  splitFocusedPost,
  studentCourseFeedHref,
} from '@/lib/community/deep-link'
import type { CommunityPost } from '@/components/community/community-feed'

/**
 * The `?post=` / `#comment-` contract (#869). Notifications (#870) build these
 * URLs; the feed pages parse them. A malformed value must never reach a
 * PostgREST filter (22P02 would fail the whole feed).
 */

const A = '7b0c3f7e-8a9d-4c1e-9f2a-1b2c3d4e5f60'
const B = '0f1e2d3c-4b5a-4968-8776-655443322110'

function post(id: string, created_at: string, extra: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id,
    author_id: 'u1',
    post_type: 'standard',
    title: null,
    content: id,
    media_urls: [],
    is_pinned: false,
    is_locked: false,
    comment_count: 0,
    reaction_count: 0,
    created_at,
    course_id: null,
    lesson_id: null,
    is_graded: false,
    milestone_type: null,
    milestone_data: null,
    author: { id: 'u1', full_name: null, avatar_url: null, role: null },
    user_reactions: [],
    ...extra,
  }
}

describe('parsePostParam', () => {
  it('accepts a uuid (any case) and normalises it', () => {
    expect(parsePostParam(A)).toBe(A)
    expect(parsePostParam(A.toUpperCase())).toBe(A)
  })

  it('takes the first value of a repeated param', () => {
    expect(parsePostParam([A, B])).toBe(A)
    expect(parsePostParam(['nope', A])).toBeNull()
  })

  it('refuses anything that is not a uuid', () => {
    for (const raw of ['', 'abc', '123', `${A} `, `${A}x`, `1' OR '1'='1`, `${A},${B}`, '(a,b)']) {
      expect(parsePostParam(raw)).toBeNull()
    }
    expect(parsePostParam(undefined)).toBeNull()
    expect(parsePostParam([])).toBeNull()
  })
})

describe('parseCommentHash', () => {
  it('reads #comment-<uuid>, with or without the #', () => {
    expect(parseCommentHash(`#comment-${A}`)).toBe(A)
    expect(parseCommentHash(`comment-${A}`)).toBe(A)
  })

  it('ignores a bare uuid, another anchor and garbage', () => {
    expect(parseCommentHash(`#${A}`)).toBeNull()
    expect(parseCommentHash(`#post-${A}`)).toBeNull()
    expect(parseCommentHash('#comment-nope')).toBeNull()
    expect(parseCommentHash('')).toBeNull()
    expect(parseCommentHash(null)).toBeNull()
  })
})

describe('anchors and hrefs', () => {
  it('names the anchors the feed renders', () => {
    expect(postAnchorId(A)).toBe(`post-${A}`)
    expect(commentAnchorId(B)).toBe(`comment-${B}`)
  })

  it('builds the student course feed link, with and without a comment', () => {
    expect(studentCourseFeedHref(2001, A)).toBe(`/dashboard/student/courses/2001/community?post=${A}`)
    expect(studentCourseFeedHref(2001, A, B)).toBe(
      `/dashboard/student/courses/2001/community?post=${A}#comment-${B}`
    )
    expect(studentCourseFeedHref(2001, A, null)).toBe(`/dashboard/student/courses/2001/community?post=${A}`)
  })
})

describe('splitFocusedPost', () => {
  const p1 = post('p1', '2026-09-03T00:00:00Z')
  const p2 = post('p2', '2026-09-02T00:00:00Z')
  const p3 = post('p3', '2026-09-01T00:00:00Z')
  const old = post('old', '2020-01-01T00:00:00Z')

  it('leaves a post that is on the first page where it is', () => {
    const r = splitFocusedPost({ focusPost: p2, initialPosts: [p1, p2], extraPosts: [] })
    expect(r.focused).toBeNull()
    expect(r.timeline.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(r.cursorPost?.id).toBe('p2')
  })

  it('leads with a post from beyond the first page and never repeats it', () => {
    const r = splitFocusedPost({ focusPost: old, initialPosts: [p1, p2], extraPosts: [p3, old] })
    expect(r.focused?.id).toBe('old')
    expect(r.timeline.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('takes the cursor from the timeline, never from the focused post', () => {
    const r = splitFocusedPost({ focusPost: old, initialPosts: [p1, p2], extraPosts: [] })
    expect(r.cursorPost?.id).toBe('p2')
    const empty = splitFocusedPost({ focusPost: old, initialPosts: [], extraPosts: [] })
    expect(empty.focused?.id).toBe('old')
    expect(empty.cursorPost).toBeNull()
  })

  it('is the plain feed without a focused post', () => {
    const r = splitFocusedPost({ focusPost: null, initialPosts: [p1], extraPosts: [p2] })
    expect(r.focused).toBeNull()
    expect(r.timeline.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(r.cursorPost?.id).toBe('p2')
  })
})
