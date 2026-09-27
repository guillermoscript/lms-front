import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The course-community entry points (#868): `lib/community/access.ts`.
 *
 * Every helper reads with the service role, so the filters ARE the security:
 * a missing tenant filter shows one school's activity to another, a missing
 * `is_hidden`/block filter quotes a post the viewer would never see on the
 * feed. The fake below applies the filters it is given to in-memory rows, so a
 * dropped filter shows up as a wrong answer, and records every call so the
 * filters themselves can be asserted too.
 */

type Row = Record<string, unknown>
type Op = [string, ...unknown[]]
type Call = { table: string; ops: Op[] }

const state: {
  tables: Record<string, Row[]>
  failing: Set<string>
  calls: Call[]
  rpc: (name: string, args: unknown) => Promise<{ data: unknown; error: { message: string } | null }>
  blocked: string[] | Error
} = {
  tables: {},
  failing: new Set(),
  calls: [],
  rpc: async () => ({ data: true, error: null }),
  blocked: [],
}

function query(table: string) {
  const call: Call = { table, ops: [] }
  state.calls.push(call)
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'gte', 'not', 'order', 'limit', 'range']) {
    builder[name] = (...args: unknown[]) => {
      call.ops.push([name, ...args])
      return builder
    }
  }

  function resolve(single: boolean) {
    if (state.failing.has(table)) return { data: null, error: { message: `${table} boom` }, count: null }

    let rows = [...(state.tables[table] ?? [])]
    let head = false
    let counted = false
    for (const [name, ...args] of call.ops) {
      if (name === 'select') {
        const opts = (args[1] ?? {}) as { count?: string; head?: boolean }
        head = opts.head === true
        counted = opts.count === 'exact'
      } else if (name === 'eq') rows = rows.filter((r) => r[args[0] as string] === args[1])
      else if (name === 'in') rows = rows.filter((r) => (args[1] as unknown[]).includes(r[args[0] as string]))
      else if (name === 'gte') rows = rows.filter((r) => String(r[args[0] as string]) >= String(args[1]))
      else if (name === 'not') {
        const list = String(args[2]).replace(/[()]/g, '').split(',')
        rows = rows.filter((r) => !list.includes(String(r[args[0] as string])))
      }
    }
    const count = counted ? rows.length : null
    for (const [name, ...args] of call.ops) {
      if (name === 'order') {
        const col = args[0] as string
        const asc = (args[1] as { ascending?: boolean } | undefined)?.ascending !== false
        rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
      } else if (name === 'limit') rows = rows.slice(0, args[0] as number)
      else if (name === 'range') rows = rows.slice(args[0] as number, (args[1] as number) + 1)
    }
    if (head) return { data: null, error: null, count }
    return { data: single ? (rows[0] ?? null) : rows, error: null, count }
  }

  builder.maybeSingle = () => {
    call.ops.push(['maybeSingle'])
    return Promise.resolve(resolve(true))
  }
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolve(false)).then(onFulfilled, onRejected)
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: query, rpc: (name: string, args: unknown) => state.rpc(name, args) }),
}))
vi.mock('@/lib/community/blocks', () => ({
  getBlockedAuthorIds: async () => {
    if (state.blocked instanceof Error) throw state.blocked
    return state.blocked
  },
}))

const {
  communityPostLabel,
  courseActivityHint,
  isCommunityEnabled,
  loadCourseCommunityEntry,
  hasVisibleCoursePosts,
  liveEntitledCourseIds,
  getCommunityCourses,
  canPinInCourse,
} = await import('@/lib/community/access')

const NOW = new Date('2026-09-27T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
const callsTo = (table: string) => state.calls.filter((c) => c.table === table)
const hasOp = (call: Call, ...op: unknown[]) => call.ops.some((o) => JSON.stringify(o) === JSON.stringify(op))

beforeEach(() => {
  state.tables = {}
  state.failing = new Set()
  state.calls = []
  state.rpc = async () => ({ data: true, error: null })
  state.blocked = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('communityPostLabel', () => {
  it('prefers the title', () => {
    expect(communityPostLabel({ post_type: 'standard', title: '  Week 1 questions ', content: 'body' })).toBe(
      'Week 1 questions'
    )
  })

  it('falls back to the content with whitespace collapsed', () => {
    expect(communityPostLabel({ post_type: 'standard', title: '  ', content: 'Hello\n\n  everyone   here' })).toBe(
      'Hello everyone here'
    )
  })

  it('cuts long text on a word boundary with an ellipsis', () => {
    const label = communityPostLabel(
      { post_type: 'standard', title: null, content: 'one two three four five six seven' },
      20
    )
    expect(label).toBe('one two three four…')
    expect(label!.length).toBeLessThanOrEqual(20)
  })

  it('hard-cuts a single word longer than the budget', () => {
    expect(communityPostLabel({ post_type: 'standard', title: null, content: 'a'.repeat(30) }, 10)).toBe(
      `${'a'.repeat(9)}…`
    )
  })

  it('never quotes a milestone', () => {
    expect(communityPostLabel({ post_type: 'milestone', title: 'x', content: '{"k":1}' })).toBeNull()
  })

  it('returns null for an empty post', () => {
    expect(communityPostLabel({ post_type: 'poll', title: null, content: '   ' })).toBeNull()
    expect(communityPostLabel({ post_type: 'standard', title: null, content: null })).toBeNull()
  })
})

describe('courseActivityHint', () => {
  it('is unknown when the activity could not be read', () => {
    expect(courseActivityHint(null)).toEqual({ kind: 'unknown' })
  })

  it('is empty only when both reads found nothing', () => {
    expect(courseActivityHint({ recentCount: 0, latest: null })).toEqual({ kind: 'empty' })
  })

  it('reports recent posts with the newest title', () => {
    expect(courseActivityHint({ recentCount: 3, latest: { id: 'p', label: 'Hi' } })).toEqual({
      kind: 'recent',
      count: 3,
      label: 'Hi',
    })
  })

  it('reports recent posts without a label', () => {
    expect(courseActivityHint({ recentCount: 1, latest: { id: 'p', label: null } })).toEqual({
      kind: 'recent',
      count: 1,
      label: null,
    })
  })

  it('falls back to the newest post when nothing is recent', () => {
    expect(courseActivityHint({ recentCount: 0, latest: { id: 'p', label: 'Old' } })).toEqual({
      kind: 'latest',
      label: 'Old',
    })
  })

  it('is unknown when the only post has nothing to quote', () => {
    expect(courseActivityHint({ recentCount: 0, latest: { id: 'p', label: null } })).toEqual({ kind: 'unknown' })
  })
})

describe('isCommunityEnabled', () => {
  it('asks community_enabled for the tenant', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    state.rpc = rpc
    expect(await isCommunityEnabled('t1')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('community_enabled', { _tenant_id: 't1' })
  })

  it.each([
    ['false', { data: false, error: null }],
    ['null', { data: null, error: null }],
    ['an error', { data: null, error: { message: 'boom' } }],
  ])('is closed on %s', async (_label, result) => {
    state.rpc = async () => result
    expect(await isCommunityEnabled('t1')).toBe(false)
  })

  it('is closed when the call throws', async () => {
    state.rpc = async () => {
      throw new Error('network')
    }
    expect(await isCommunityEnabled('t1')).toBe(false)
  })
})

function post(overrides: Row): Row {
  return {
    id: 'p',
    tenant_id: 't1',
    course_id: 7,
    author_id: 'a1',
    is_hidden: false,
    post_type: 'standard',
    title: null,
    content: 'hello',
    created_at: daysAgo(1),
    ...overrides,
  }
}

describe('loadCourseCommunityEntry', () => {
  const args = { tenantId: 't1', viewerId: 'v1', courseId: 7, now: NOW }

  it('reads no posts when the community is off', async () => {
    state.rpc = async () => ({ data: false, error: null })
    expect(await loadCourseCommunityEntry(args)).toEqual({ enabled: false })
    expect(callsTo('community_posts')).toHaveLength(0)
  })

  it('scopes both reads to the tenant, the course and visible posts, and counts a 7-day window', async () => {
    state.tables.community_posts = [
      post({ id: 'recent', title: 'Newest', created_at: daysAgo(1) }),
      post({ id: 'old', created_at: daysAgo(10) }),
      post({ id: 'hidden', is_hidden: true, created_at: daysAgo(0.5) }),
      post({ id: 'other-course', course_id: 8, created_at: daysAgo(0.1) }),
      post({ id: 'other-school', tenant_id: 't2', created_at: daysAgo(0.1) }),
    ]

    expect(await loadCourseCommunityEntry(args)).toEqual({
      enabled: true,
      activity: { recentCount: 1, latest: { id: 'recent', label: 'Newest' } },
    })

    const [count, latest] = callsTo('community_posts')
    for (const call of [count, latest]) {
      expect(hasOp(call, 'eq', 'tenant_id', 't1')).toBe(true)
      expect(hasOp(call, 'eq', 'course_id', 7)).toBe(true)
      expect(hasOp(call, 'eq', 'is_hidden', false)).toBe(true)
    }
    expect(hasOp(count, 'select', 'id', { count: 'exact', head: true })).toBe(true)
    expect(hasOp(count, 'gte', 'created_at', daysAgo(7))).toBe(true)
    expect(hasOp(latest, 'order', 'created_at', { ascending: false })).toBe(true)
    expect(hasOp(latest, 'limit', 1)).toBe(true)
  })

  it('reports the newest post even when it is older than the window', async () => {
    state.tables.community_posts = [post({ id: 'old', content: 'From last month', created_at: daysAgo(30) })]
    expect(await loadCourseCommunityEntry(args)).toEqual({
      enabled: true,
      activity: { recentCount: 0, latest: { id: 'old', label: 'From last month' } },
    })
  })

  it('leaves out the authors the viewer blocked, on both reads', async () => {
    state.blocked = ['blocked-1', 'blocked-2']
    state.tables.community_posts = [post({ id: 'from-blocked', author_id: 'blocked-1', created_at: daysAgo(0.1) })]

    expect(await loadCourseCommunityEntry(args)).toEqual({
      enabled: true,
      activity: { recentCount: 0, latest: null },
    })
    for (const call of callsTo('community_posts')) {
      expect(hasOp(call, 'not', 'author_id', 'in', '(blocked-1,blocked-2)')).toBe(true)
    }
  })

  it('reports an empty feed as zero posts and no latest', async () => {
    expect(await loadCourseCommunityEntry(args)).toEqual({
      enabled: true,
      activity: { recentCount: 0, latest: null },
    })
  })

  it('returns no activity (not "empty") when a read fails', async () => {
    state.failing.add('community_posts')
    expect(await loadCourseCommunityEntry(args)).toEqual({ enabled: true, activity: null })
  })

  it('returns no activity when the blocks cannot be read', async () => {
    state.blocked = new Error('blocks down')
    state.tables.community_posts = [post({})]
    expect(await loadCourseCommunityEntry(args)).toEqual({ enabled: true, activity: null })
    expect(callsTo('community_posts')).toHaveLength(0)
  })
})

describe('hasVisibleCoursePosts', () => {
  it('is true when the course feed has a visible post', async () => {
    state.tables.community_posts = [post({})]
    expect(await hasVisibleCoursePosts({ tenantId: 't1', courseId: 7 })).toBe(true)
    const [call] = callsTo('community_posts')
    expect(hasOp(call, 'eq', 'tenant_id', 't1')).toBe(true)
    expect(hasOp(call, 'eq', 'is_hidden', false)).toBe(true)
  })

  it('ignores hidden posts and other schools', async () => {
    state.tables.community_posts = [post({ is_hidden: true }), post({ tenant_id: 't2' })]
    expect(await hasVisibleCoursePosts({ tenantId: 't1', courseId: 7 })).toBe(false)
  })

  it('is null when it cannot tell', async () => {
    state.failing.add('community_posts')
    expect(await hasVisibleCoursePosts({ tenantId: 't1', courseId: 7 })).toBeNull()
  })
})

describe('liveEntitledCourseIds (mirror of has_course_access)', () => {
  it('drops expired entitlements and keeps open-ended ones', () => {
    expect(
      liveEntitledCourseIds(
        [
          { course_id: 1, expires_at: null },
          { course_id: 2, expires_at: daysAgo(-3) },
          { course_id: 3, expires_at: daysAgo(1) },
        ],
        null,
        NOW
      )
    ).toEqual([1, 2])
  })

  it('opens nothing once the tenant cutoff has passed', () => {
    expect(liveEntitledCourseIds([{ course_id: 1, expires_at: null }], daysAgo(1), NOW)).toEqual([])
    expect(liveEntitledCourseIds([{ course_id: 1, expires_at: null }], NOW.toISOString(), NOW)).toEqual([])
  })

  it('ignores a cutoff still in the future', () => {
    expect(liveEntitledCourseIds([{ course_id: 1, expires_at: null }], daysAgo(-1), NOW)).toEqual([1])
  })

  it('lists a course once however many entitlements open it', () => {
    expect(
      liveEntitledCourseIds(
        [
          { course_id: 1, expires_at: null },
          { course_id: 1, expires_at: daysAgo(-3) },
        ],
        null,
        NOW
      )
    ).toEqual([1])
  })
})

describe('getCommunityCourses', () => {
  beforeEach(() => {
    state.tables.tenants = [{ id: 't1', access_cutoff_at: null }]
    state.tables.entitlements = [
      { entitlement_id: 1, user_id: 'u1', tenant_id: 't1', status: 'active', course_id: 10, expires_at: null },
      { entitlement_id: 2, user_id: 'u1', tenant_id: 't1', status: 'active', course_id: 11, expires_at: null },
      { entitlement_id: 3, user_id: 'u1', tenant_id: 't1', status: 'active', course_id: 12, expires_at: null },
      { entitlement_id: 4, user_id: 'u1', tenant_id: 't1', status: 'active', course_id: 13, expires_at: daysAgo(2) },
      { entitlement_id: 5, user_id: 'u1', tenant_id: 't1', status: 'revoked', course_id: 14, expires_at: null },
      { entitlement_id: 6, user_id: 'u1', tenant_id: 't2', status: 'active', course_id: 20, expires_at: null },
      { entitlement_id: 7, user_id: 'u2', tenant_id: 't1', status: 'active', course_id: 15, expires_at: null },
    ]
    state.tables.enrollments = [
      { enrollment_id: 1, user_id: 'u1', tenant_id: 't1', status: 'active', course_id: 12 },
      { enrollment_id: 2, user_id: 'u1', tenant_id: 't1', status: 'disabled', course_id: 11 },
    ]
    state.tables.courses = [
      { course_id: 10, tenant_id: 't1', title: 'beta' },
      { course_id: 11, tenant_id: 't1', title: 'Alpha' },
      { course_id: 12, tenant_id: 't1', title: 'Zeta' },
      { course_id: 13, tenant_id: 't1', title: 'Expired' },
      { course_id: 14, tenant_id: 't1', title: 'Revoked' },
      { course_id: 15, tenant_id: 't1', title: 'Someone else' },
      { course_id: 20, tenant_id: 't2', title: 'Other school' },
    ]
  })

  it('lists the live entitled courses of this school, enrolled first, then by title', async () => {
    expect(await getCommunityCourses({ tenantId: 't1', userId: 'u1', now: NOW })).toEqual([
      { courseId: 12, title: 'Zeta' },
      { courseId: 11, title: 'Alpha' },
      { courseId: 10, title: 'beta' },
    ])

    const [entitlements] = callsTo('entitlements')
    expect(hasOp(entitlements, 'eq', 'tenant_id', 't1')).toBe(true)
    expect(hasOp(entitlements, 'eq', 'user_id', 'u1')).toBe(true)
    expect(hasOp(entitlements, 'eq', 'status', 'active')).toBe(true)
    const [courses] = callsTo('courses')
    expect(hasOp(courses, 'eq', 'tenant_id', 't1')).toBe(true)
    const [tenant] = callsTo('tenants')
    expect(hasOp(tenant, 'eq', 'id', 't1')).toBe(true)
  })

  it('does not list a course of another school even if an entitlement points at it', async () => {
    state.tables.entitlements.push({
      entitlement_id: 8,
      user_id: 'u1',
      tenant_id: 't1',
      status: 'active',
      course_id: 20,
      expires_at: null,
    })
    const ids = (await getCommunityCourses({ tenantId: 't1', userId: 'u1', now: NOW })).map((c) => c.courseId)
    expect(ids).not.toContain(20)
  })

  it('lists nothing once the school is past its access cutoff', async () => {
    state.tables.tenants = [{ id: 't1', access_cutoff_at: daysAgo(1) }]
    expect(await getCommunityCourses({ tenantId: 't1', userId: 'u1', now: NOW })).toEqual([])
    expect(callsTo('courses')).toHaveLength(0)
  })

  it('lists nothing (and does not throw) when a read fails', async () => {
    state.failing.add('entitlements')
    expect(await getCommunityCourses({ tenantId: 't1', userId: 'u1', now: NOW })).toEqual([])
  })
})

describe('canPinInCourse', () => {
  beforeEach(() => {
    state.tables.courses = [
      { course_id: 7, tenant_id: 't1', author_id: 'teacher-1' },
      { course_id: 9, tenant_id: 't2', author_id: 'teacher-1' },
    ]
  })

  it('lets an admin pin without reading the course', async () => {
    expect(await canPinInCourse({ tenantId: 't1', userId: 'admin-1', role: 'admin', courseId: 7 })).toBe(true)
    expect(callsTo('courses')).toHaveLength(0)
  })

  it('lets a teacher pin in a course they author', async () => {
    expect(await canPinInCourse({ tenantId: 't1', userId: 'teacher-1', role: 'teacher', courseId: 7 })).toBe(true)
  })

  it('refuses a teacher in someone else’s course', async () => {
    expect(await canPinInCourse({ tenantId: 't1', userId: 'teacher-2', role: 'teacher', courseId: 7 })).toBe(false)
  })

  it('refuses a student and a non-member', async () => {
    expect(await canPinInCourse({ tenantId: 't1', userId: 'teacher-1', role: 'student', courseId: 7 })).toBe(false)
    expect(await canPinInCourse({ tenantId: 't1', userId: 'teacher-1', role: null, courseId: 7 })).toBe(false)
  })

  it('refuses a course of another school, even the teacher’s own', async () => {
    expect(await canPinInCourse({ tenantId: 't1', userId: 'teacher-1', role: 'teacher', courseId: 9 })).toBe(false)
  })
})
