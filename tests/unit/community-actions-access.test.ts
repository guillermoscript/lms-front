import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins the access decisions in the community server actions (#860).
 *
 * `getFeedPage` and every write read/write with the service role, so these
 * checks are the only thing between a caller and another school's data:
 *   - `loadMorePosts` takes NO tenant/user from the client; the tenant is the
 *     request's, and a course feed re-checks the course (this tenant) and the
 *     student's access.
 *   - `createPoll` validates its course like `createPost` (it used not to).
 *   - Non-members of the school cannot post anywhere.
 *   - `createComment` from the lesson page (#869) skips revalidation — in
 *     Next 16 it would re-render the whole lesson in the action's response.
 */

type Row = Record<string, unknown>

const state: {
  tenantId: string
  userId: string
  role: 'student' | 'teacher' | 'admin' | null
  courses: Row[]
  posts: Row[]
  comments: Row[]
  access: boolean
  inserted: { table: string; row: unknown }[]
} = { tenantId: 't1', userId: 'u1', role: 'student', courses: [], posts: [], comments: [], access: false, inserted: [] }

function query(table: string) {
  const filters: [string, unknown][] = []
  const rows = () =>
    (({ courses: state.courses, community_posts: state.posts, community_comments: state.comments })[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return builder
    },
    in: () => builder,
    is: () => builder,
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    // Nobody is muted or has reacted yet; an insert's `.single()` returns the new row.
    single: () =>
      Promise.resolve({ data: ['community_user_mutes', 'community_reactions'].includes(table) ? null : (rows()[0] ?? { id: 'new-post' }), error: null }),
    insert: (row: unknown) => {
      state.inserted.push({ table, row })
      return builder
    },
    delete: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: query }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: query }) }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: async () => state.tenantId,
  getCurrentUserId: async () => state.userId,
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: async () => state.role }))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: async () => state.access }))
const { revalidatePath, track } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  track: vi.fn(async () => {}),
}))
vi.mock('@/lib/analytics/server', () => ({ track }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/community/blocks', () => ({ getBlockedAuthorIds: async () => [] }))

const getFeedPage = vi.fn(async (_args: unknown) => ({ posts: [], hasMore: false }))
vi.mock('@/lib/community/feed', () => ({ getFeedPage: (args: unknown) => getFeedPage(args) }))

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.co')

const { loadMorePosts, createPoll, createPost, getComments, toggleReaction, castVote, createComment, updatePost } =
  await import('@/app/actions/community')

const CURSOR = '2026-09-01T00:00:00.000Z'

beforeEach(() => {
  state.tenantId = 't1'
  state.userId = 'u1'
  state.role = 'student'
  state.courses = [
    { course_id: 1, tenant_id: 't1' },
    { course_id: 2, tenant_id: 't2' },
  ]
  state.posts = [
    { id: 'p-school', tenant_id: 't1', course_id: null, post_type: 'standard', is_hidden: false, is_locked: false },
    { id: 'p-course', tenant_id: 't1', course_id: 1, post_type: 'poll', is_hidden: false, is_locked: false },
    { id: 'p-hidden', tenant_id: 't1', course_id: null, post_type: 'standard', is_hidden: true, is_locked: false },
    { id: 'p-other', tenant_id: 't2', course_id: null, post_type: 'poll', is_hidden: false, is_locked: false },
    // A school-feed milestone the database wrote about u1 (#871).
    { id: 'p-milestone', tenant_id: 't1', author_id: 'u1', course_id: null, post_type: 'milestone', is_hidden: false, is_locked: false },
  ]
  state.comments = [{ id: 'c-other', tenant_id: 't2', post_id: 'p-other', is_hidden: false }]
  state.access = false
  state.inserted = []
  getFeedPage.mockClear()
  revalidatePath.mockClear()
  track.mockClear()
})

describe('loadMorePosts', () => {
  it('reads the school feed of the REQUEST tenant as the request user', async () => {
    const result = await loadMorePosts('school', CURSOR)
    expect(result.success).toBe(true)
    expect(getFeedPage).toHaveBeenCalledWith({
      tenantId: 't1',
      viewerId: 'u1',
      scope: 'school',
      courseId: undefined,
      cursor: CURSOR,
      questionFilter: null,
    })
  })

  it('passes a known question filter through and drops anything else (#875)', async () => {
    await loadMorePosts('school', CURSOR, undefined, 'unanswered')
    expect(getFeedPage).toHaveBeenLastCalledWith(expect.objectContaining({ questionFilter: 'unanswered' }))
    await loadMorePosts('school', CURSOR, undefined, 'is.null,or(')
    expect(getFeedPage).toHaveBeenLastCalledWith(expect.objectContaining({ questionFilter: null }))
  })

  it('refuses a non-member', async () => {
    state.role = null
    expect((await loadMorePosts('school', CURSOR)).success).toBe(false)
    expect(getFeedPage).not.toHaveBeenCalled()
  })

  it('refuses another school’s course', async () => {
    state.role = 'admin'
    expect(await loadMorePosts('course', CURSOR, 2)).toEqual({ success: false, error: 'Course not found' })
    expect(getFeedPage).not.toHaveBeenCalled()
  })

  it('refuses a course the student cannot access', async () => {
    expect(await loadMorePosts('course', CURSOR, 1)).toEqual({ success: false, error: 'Access denied' })
    expect(getFeedPage).not.toHaveBeenCalled()
  })

  it('serves a course the student can access, and staff without enrollment', async () => {
    state.access = true
    expect((await loadMorePosts('course', CURSOR, 1)).success).toBe(true)
    state.access = false
    state.role = 'teacher'
    expect((await loadMorePosts('course', CURSOR, 1)).success).toBe(true)
    expect(getFeedPage).toHaveBeenCalledTimes(2)
  })

  it('rejects a malformed cursor or course id', async () => {
    expect((await loadMorePosts('school', 'nope')).success).toBe(false)
    expect((await loadMorePosts('course', CURSOR, -1)).success).toBe(false)
    expect((await loadMorePosts('course', CURSOR)).success).toBe(false)
    expect(getFeedPage).not.toHaveBeenCalled()
  })
})

function pollForm(courseId?: number) {
  const fd = new FormData()
  fd.append('title', 'Question?')
  fd.append('content', '')
  fd.append('options', JSON.stringify(['a', 'b']))
  if (courseId) fd.append('course_id', String(courseId))
  return fd
}

describe('createPoll course target', () => {
  it('refuses another school’s course', async () => {
    state.role = 'admin'
    expect(await createPoll(pollForm(2))).toEqual({ success: false, error: 'Course not found' })
    expect(state.inserted).toHaveLength(0)
  })

  it('refuses a course the student is not enrolled in', async () => {
    const result = await createPoll(pollForm(1))
    expect(result.success).toBe(false)
    expect(state.inserted).toHaveLength(0)
  })

  it('creates a school poll with an empty body', async () => {
    const result = await createPoll(pollForm())
    expect(result.success).toBe(true)
    expect(state.inserted[0]).toMatchObject({ table: 'community_posts', row: { post_type: 'poll', content: '', course_id: null } })
  })
})

describe('createPost', () => {
  it('refuses a non-member', async () => {
    state.role = null
    const fd = new FormData()
    fd.append('content', 'hi')
    expect((await createPost(fd)).success).toBe(false)
    expect(state.inserted).toHaveLength(0)
  })

  it('refuses a poll or milestone type (polls go through createPoll)', async () => {
    state.role = 'admin'
    for (const type of ['poll', 'milestone']) {
      const fd = new FormData()
      fd.append('content', 'hi')
      fd.append('post_type', type)
      expect((await createPost(fd)).success).toBe(false)
    }
    expect(state.inserted).toHaveLength(0)
  })

  it('refuses a graded post from a student', async () => {
    const fd = new FormData()
    fd.append('content', 'hi')
    fd.append('is_graded', 'true')
    expect((await createPost(fd)).success).toBe(false)
  })

  it('refuses an attachment outside the poster’s folder', async () => {
    const fd = new FormData()
    fd.append('content', 'hi')
    fd.append('media_urls', JSON.stringify([{ url: 'https://evil.example/x.png', type: 'image', name: 'x' }]))
    expect(await createPost(fd)).toEqual({ success: false, error: 'Invalid attachments' })
    expect(state.inserted).toHaveLength(0)
  })
})

describe('comments, reactions and votes reach only visible posts', () => {
  it('getComments refuses another school’s post (tenant is the request’s)', async () => {
    expect(await getComments('p-other')).toEqual({ success: false, error: 'Post not found' })
  })

  it('getComments refuses a course post the student cannot access, and a hidden post', async () => {
    expect((await getComments('p-course')).success).toBe(false)
    expect((await getComments('p-hidden')).success).toBe(false)
  })

  it('toggleReaction refuses another school’s post or comment, and an unknown type', async () => {
    expect((await toggleReaction('post', 'p-other', 'like')).success).toBe(false)
    expect((await toggleReaction('comment', 'c-other', 'like')).success).toBe(false)
    // @ts-expect-error — a forged reaction type from the wire
    expect((await toggleReaction('post', 'p-school', 'hack')).success).toBe(false)
    expect(state.inserted).toHaveLength(0)
  })

  it('castVote refuses another school’s poll and a course poll without access', async () => {
    expect((await castVote('p-other', 'o1')).success).toBe(false)
    expect((await castVote('p-course', 'o1')).success).toBe(false)
    expect(state.inserted).toHaveLength(0)
  })

  it('createComment refuses a non-member and another school’s post', async () => {
    expect((await createComment('p-other', 'hi')).success).toBe(false)
    state.role = null
    expect((await createComment('p-school', 'hi')).success).toBe(false)
    expect(state.inserted).toHaveLength(0)
  })

  it('a reachable post still works', async () => {
    expect((await toggleReaction('post', 'p-school', 'like')).success).toBe(true)
    expect(state.inserted[0]).toMatchObject({ table: 'community_reactions', row: { post_id: 'p-school' } })
  })
})

describe('milestone posts (#871)', () => {
  it('updatePost refuses a milestone, even from the student it is about', async () => {
    expect(await updatePost('p-milestone', 'rewritten')).toEqual({
      success: false,
      error: 'Milestone posts cannot be edited',
    })
  })

  it('reactions and comments work on a reachable milestone', async () => {
    state.userId = 'u2'
    expect((await toggleReaction('post', 'p-milestone', 'like')).success).toBe(true)
    expect((await createComment('p-milestone', 'Well done')).success).toBe(true)
    expect(state.inserted.map((i) => i.table)).toEqual(['community_reactions', 'community_comments'])
    expect(state.inserted[1]).toMatchObject({ row: { post_id: 'p-milestone', author_id: 'u2', content: 'Well done' } })
  })
})

describe('createComment surface (#869)', () => {
  it('refuses a locked post', async () => {
    state.posts.push({ id: 'p-locked', tenant_id: 't1', course_id: null, post_type: 'discussion_prompt', is_hidden: false, is_locked: true })
    const result = await createComment('p-locked', 'hi')
    expect(result.success).toBe(false)
    expect(state.inserted).toHaveLength(0)
  })

  it('from the lesson: no revalidation, tracked as the lesson', async () => {
    const result = await createComment('p-school', 'my answer', undefined, { surface: 'lesson' })
    expect(result.success).toBe(true)
    expect(state.inserted[0]).toMatchObject({ table: 'community_comments', row: { post_id: 'p-school', content: 'my answer' } })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(track).toHaveBeenCalledWith(
      'community_comment_created',
      expect.objectContaining({ surface: 'lesson', is_reply: false }),
      expect.anything()
    )
  })

  it('from the feed (the default): revalidates, tracked as the feed', async () => {
    expect((await createComment('p-school', 'hi')).success).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
    expect(track).toHaveBeenCalledWith('community_comment_created', expect.objectContaining({ surface: 'feed' }), expect.anything())
  })

  it('treats an unknown surface from the wire as the feed', async () => {
    // @ts-expect-error — a forged surface value
    expect((await createComment('p-school', 'hi', undefined, { surface: 'admin' })).success).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
    expect(track).toHaveBeenCalledWith('community_comment_created', expect.objectContaining({ surface: 'feed' }), expect.anything())
  })
})
