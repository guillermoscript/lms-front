import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Who may pin (#868). The course welcome prompt is posted pinned, and the
 * teacher who posts it must be able to unpin it, so pinning moved from
 * "admins only" to "admins, or the course's author in that course's feed".
 * Both paths write with the service role (RLS refuses a pinned insert from
 * members), so these checks are the whole gate:
 *   - `createPost` with `is_pinned=true`: course feed only, author or admin.
 *   - `pinPost` / `unpinPost`: the post must be in THIS school; admin, or the
 *     author of the post's course.
 *   - Lock / hide stay admin-only.
 */

type Row = Record<string, unknown>

const state: {
  tenantId: string
  userId: string
  role: 'student' | 'teacher' | 'admin' | null
  access: boolean
  courses: Row[]
  posts: Row[]
  inserted: { table: string; row: Row }[]
  updated: { table: string; values: Row; filters: [string, unknown][] }[]
} = { tenantId: 't1', userId: 'u1', role: 'student', access: true, courses: [], posts: [], inserted: [], updated: [] }

function query(table: string) {
  const filters: [string, unknown][] = []
  let update: Row | null = null
  const rows = () =>
    (({ courses: state.courses, community_posts: state.posts })[table] ?? []).filter((r) =>
      filters.every(([c, v]) => r[c] === v)
    )
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return builder
    },
    in: () => builder,
    is: () => builder,
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    // Nobody is muted; an insert's `.single()` returns the new row.
    single: () =>
      Promise.resolve({
        data: table === 'community_user_mutes' ? null : table === 'community_posts' ? { id: 'new-post' } : (rows()[0] ?? null),
        error: null,
      }),
    insert: (row: Row) => {
      state.inserted.push({ table, row })
      return builder
    },
    update: (values: Row) => {
      update = values
      return builder
    },
    then: (resolve: (v: unknown) => void) => {
      if (update) state.updated.push({ table, values: update, filters: [...filters] })
      resolve({ data: null, error: null })
    },
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: query }),
  verifyAdminAccess: async () => {
    if (state.role !== 'admin') throw new Error('Unauthorized: Admin access required')
    return true
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: query }) }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: async () => state.tenantId,
  getCurrentUserId: async () => state.userId,
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: async () => state.role }))
vi.mock('@/lib/services/course-access', () => ({ hasCourseAccess: async () => state.access }))
vi.mock('@/lib/analytics/server', () => ({ track: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/community/blocks', () => ({ getBlockedAuthorIds: async () => [] }))
vi.mock('@/lib/community/feed', () => ({ getFeedPage: async () => ({ posts: [], hasMore: false }) }))

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.co')

const { createPost } = await import('@/app/actions/community')
const { pinPost, unpinPost, lockPost } = await import('@/app/actions/admin/community')

beforeEach(() => {
  state.tenantId = 't1'
  state.userId = 'u1'
  state.role = 'student'
  state.access = true
  state.courses = [
    { course_id: 1, tenant_id: 't1', author_id: 'author' },
    { course_id: 2, tenant_id: 't1', author_id: 'someone-else' },
    { course_id: 9, tenant_id: 't2', author_id: 'author' },
  ]
  state.posts = [
    { id: 'p-course', tenant_id: 't1', course_id: 1 },
    { id: 'p-other-course', tenant_id: 't1', course_id: 2 },
    { id: 'p-school', tenant_id: 't1', course_id: null },
    { id: 'p-other-school', tenant_id: 't2', course_id: 9 },
  ]
  state.inserted = []
  state.updated = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function welcomeForm({ courseId = 1, pinned = true, type = 'discussion_prompt' } = {}) {
  const fd = new FormData()
  fd.append('post_type', type)
  fd.append('title', 'Introduce yourself')
  fd.append('content', 'Tell us who you are.')
  if (courseId) fd.append('course_id', String(courseId))
  if (pinned) fd.append('is_pinned', 'true')
  return fd
}

describe('createPost with is_pinned', () => {
  it('refuses a student, and inserts nothing', async () => {
    const result = await createPost(welcomeForm({ type: 'standard' }))
    expect(result).toEqual({ success: false, error: 'Only the course author or an admin can pin posts' })
    expect(state.inserted).toHaveLength(0)
  })

  it('refuses a teacher who does not author the course', async () => {
    state.role = 'teacher'
    const result = await createPost(welcomeForm({ courseId: 2 }))
    expect(result).toEqual({ success: false, error: 'Only the course author or an admin can pin posts' })
    expect(state.inserted).toHaveLength(0)
  })

  it('refuses a pinned post in the school feed, even from an admin', async () => {
    state.role = 'admin'
    const result = await createPost(welcomeForm({ courseId: 0 }))
    expect(result).toEqual({ success: false, error: 'Only course posts can be pinned when posting' })
    expect(state.inserted).toHaveLength(0)
  })

  it('refuses another school’s course before the pin rule is reached', async () => {
    state.role = 'teacher'
    state.userId = 'author'
    expect(await createPost(welcomeForm({ courseId: 9 }))).toEqual({ success: false, error: 'Course not found' })
    expect(state.inserted).toHaveLength(0)
  })

  it('lets the course author post pinned', async () => {
    state.role = 'teacher'
    state.userId = 'author'
    expect((await createPost(welcomeForm())).success).toBe(true)
    expect(state.inserted[0]).toMatchObject({
      table: 'community_posts',
      row: { tenant_id: 't1', course_id: 1, post_type: 'discussion_prompt', is_pinned: true, author_id: 'author' },
    })
  })

  it('lets an admin post pinned in any course of the school', async () => {
    state.role = 'admin'
    expect((await createPost(welcomeForm({ courseId: 2 }))).success).toBe(true)
    expect(state.inserted[0]).toMatchObject({ row: { course_id: 2, is_pinned: true } })
  })

  it('inserts unpinned without the flag', async () => {
    state.role = 'teacher'
    expect((await createPost(welcomeForm({ courseId: 2, pinned: false }))).success).toBe(true)
    expect(state.inserted[0]).toMatchObject({ row: { is_pinned: false } })
  })
})

describe('pinPost / unpinPost', () => {
  it('lets an admin pin any post of the school, school feed included', async () => {
    state.role = 'admin'
    expect(await pinPost('p-school')).toEqual({ success: true })
    expect(state.updated).toEqual([
      {
        table: 'community_posts',
        values: expect.objectContaining({ is_pinned: true }),
        filters: [
          ['id', 'p-school'],
          ['tenant_id', 't1'],
        ],
      },
    ])
  })

  it('lets the course author pin and unpin in their course', async () => {
    state.role = 'teacher'
    state.userId = 'author'
    expect(await pinPost('p-course')).toEqual({ success: true })
    expect(await unpinPost('p-course')).toEqual({ success: true })
    expect(state.updated.map((u) => u.values.is_pinned)).toEqual([true, false])
  })

  it('refuses a teacher on a school-feed post or another author’s course', async () => {
    state.role = 'teacher'
    state.userId = 'author'
    expect(await pinPost('p-school')).toEqual({ success: false, error: 'Access denied' })
    expect(await unpinPost('p-other-course')).toEqual({ success: false, error: 'Access denied' })
    expect(state.updated).toHaveLength(0)
  })

  it('refuses a student', async () => {
    expect(await pinPost('p-course')).toEqual({ success: false, error: 'Access denied' })
    expect(state.updated).toHaveLength(0)
  })

  it('does not find a post of another school, even for its course’s author or an admin', async () => {
    state.role = 'teacher'
    state.userId = 'author'
    expect(await pinPost('p-other-school')).toEqual({ success: false, error: 'Post not found' })
    state.role = 'admin'
    expect(await unpinPost('p-other-school')).toEqual({ success: false, error: 'Post not found' })
    expect(state.updated).toHaveLength(0)
  })

  it('refuses a non-member', async () => {
    state.role = null
    expect(await pinPost('p-course')).toEqual({ success: false, error: 'Access denied' })
  })
})

describe('lock stays admin-only', () => {
  it('refuses the course author', async () => {
    state.role = 'teacher'
    state.userId = 'author'
    expect((await lockPost('p-course')).success).toBe(false)
    expect(state.updated).toHaveLength(0)
  })
})
