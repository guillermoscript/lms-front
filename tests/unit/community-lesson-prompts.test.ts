import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The lesson page's discussion prompts and the feed's deep link (#869).
 *
 * Both read with the service role, so the filters ARE the access rules once
 * the page's own gate has passed: this school, this course, this lesson, not
 * hidden, nobody the viewer blocked. These tests pin every filter, the cap and
 * the "answered" definition, and that the deep link goes through the exact
 * query the feed uses.
 */

type Call = [string, ...unknown[]]
type Result = { data: unknown; error: unknown; count?: number | null }

const state: {
  queries: { table: string; calls: Call[] }[]
  rpcCalls: [string, unknown][]
  rpc: Result
  blocked: string[]
  results: Record<string, Result | ((calls: Call[]) => Result)>
} = { queries: [], rpcCalls: [], rpc: { data: true, error: null }, blocked: [], results: {} }

/** A PostgREST builder that records every call and resolves per table. */
function from(table: string) {
  const query = { table, calls: [] as Call[] }
  state.queries.push(query)
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const entry = state.results[table] ?? { data: [], error: null }
          const result = typeof entry === 'function' ? entry(query.calls) : entry
          return (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          query.calls.push([String(prop), ...args])
          return builder
        }
      },
    }
  )
  return builder
}

const client = {
  from,
  rpc: (name: string, args: unknown) => {
    state.rpcCalls.push([name, args])
    return Promise.resolve(state.rpc)
  },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }))
vi.mock('@/lib/community/blocks', () => ({ getBlockedAuthorIds: async () => state.blocked }))

const { getLessonPrompts, getLessonPromptCounts, LESSON_PROMPT_LIMIT } = await import('@/lib/community/lesson-prompts')
const { getFeedPage, getFeedFocus, visiblePostsQuery } = await import('@/lib/community/feed')

const TENANT = 't1'
const VIEWER = 'viewer-1'
const POST_ID = '7b0c3f7e-8a9d-4c1e-9f2a-1b2c3d4e5f60'

function queriesOf(table: string) {
  return state.queries.filter((q) => q.table === table)
}

function prompts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    title: `Prompt ${i}`,
    content: 'What do you think?',
    is_pinned: false,
    is_locked: false,
    is_graded: false,
    created_at: '2026-09-01T00:00:00Z',
    author_id: 'teacher',
  }))
}

/** A head-count query (`select('id', { count: 'exact', head: true })`). */
function isCount(calls: Call[]) {
  return calls.some(([m, , opts]) => m === 'select' && (opts as { head?: boolean } | undefined)?.head === true)
}

/** The comment queries: the viewer's answers, then one count per prompt. */
function commentResults(answers: { post_id: string }[], counts: Record<string, number>) {
  return (calls: Call[]): Result => {
    if (!isCount(calls)) return { data: answers, error: null }
    const post = calls.find(([m, c]) => m === 'eq' && c === 'post_id')?.[2] as string
    return { data: null, error: null, count: counts[post] ?? 0 }
  }
}

const ARGS = { tenantId: TENANT, viewerId: VIEWER, courseId: 2001, lessonId: 3001 }

beforeEach(() => {
  state.queries = []
  state.rpcCalls = []
  state.rpc = { data: true, error: null }
  state.blocked = []
  state.results = {}
})

describe('getLessonPrompts', () => {
  it('reads this lesson’s visible prompts in this school and course, pinned first then oldest', async () => {
    state.results.community_posts = { data: prompts(2), error: null }
    const result = await getLessonPrompts(ARGS)

    expect(state.rpcCalls).toEqual([['community_enabled', { _tenant_id: TENANT }]])
    const [posts] = queriesOf('community_posts')
    expect(posts.calls).toEqual(
      expect.arrayContaining([
        ['eq', 'tenant_id', TENANT],
        ['eq', 'is_hidden', false],
        ['eq', 'course_id', 2001],
        ['eq', 'lesson_id', 3001],
        ['eq', 'post_type', 'discussion_prompt'],
        ['limit', LESSON_PROMPT_LIMIT + 1],
      ])
    )
    const orders = posts.calls.filter(([m]) => m === 'order')
    expect(orders).toEqual([
      ['order', 'is_pinned', { ascending: false }],
      ['order', 'created_at', { ascending: true }],
    ])
    expect(posts.calls.some(([m]) => m === 'not')).toBe(false)
    // The feed's counter is not the lesson's number (it counts replies and
    // never drops on a removal).
    expect(posts.calls).toContainEqual(['select', expect.not.stringContaining('comment_count')])
    expect(result).toMatchObject({ enabled: true, hasMore: false })
  })

  it('leaves out authors the viewer blocked', async () => {
    state.blocked = ['b1', 'b2']
    await getLessonPrompts(ARGS)
    const [posts] = queriesOf('community_posts')
    expect(posts.calls).toContainEqual(['not', 'author_id', 'in', '(b1,b2)'])
  })

  it('caps the list and says when there are more', async () => {
    state.results.community_posts = { data: prompts(LESSON_PROMPT_LIMIT), error: null }
    const exact = await getLessonPrompts(ARGS)
    expect(exact.enabled && exact.prompts.length).toBe(LESSON_PROMPT_LIMIT)
    expect(exact.enabled && exact.hasMore).toBe(false)

    state.results.community_posts = { data: prompts(LESSON_PROMPT_LIMIT + 1), error: null }
    const over = await getLessonPrompts(ARGS)
    expect(over.enabled && over.prompts.length).toBe(LESSON_PROMPT_LIMIT)
    expect(over.enabled && over.hasMore).toBe(true)
  })

  it('reads nothing else when the plan has no community', async () => {
    state.rpc = { data: false, error: null }
    expect(await getLessonPrompts(ARGS)).toEqual({ enabled: false })
    expect(queriesOf('community_posts')).toHaveLength(0)
    expect(queriesOf('community_comments')).toHaveLength(0)
  })

  it('skips the answers query when the lesson has no prompts', async () => {
    const result = await getLessonPrompts(ARGS)
    expect(result).toEqual({
      enabled: true,
      prompts: [],
      answeredIds: new Set(),
      hasMore: false,
      loadId: expect.any(String),
    })
    expect(queriesOf('community_comments')).toHaveLength(0)
  })

  it('counts only the viewer’s own visible top-level answers as answering', async () => {
    state.results.community_posts = { data: prompts(3), error: null }
    state.results.community_comments = commentResults([{ post_id: 'p0' }, { post_id: 'p2' }, { post_id: 'p2' }], {})
    const result = await getLessonPrompts(ARGS)

    const [answers] = queriesOf('community_comments').filter((q) => !isCount(q.calls))
    expect(answers.calls).toEqual(
      expect.arrayContaining([
        ['eq', 'tenant_id', TENANT],
        ['eq', 'author_id', VIEWER],
        ['eq', 'is_hidden', false],
        ['is', 'parent_comment_id', null],
        ['in', 'post_id', ['p0', 'p1', 'p2']],
      ])
    )
    expect(result.enabled && [...result.answeredIds].sort()).toEqual(['p0', 'p2'])
  })

  it('counts each prompt’s answers the way its thread shows them: visible, top-level, not blocked', async () => {
    state.blocked = ['b1']
    state.results.community_posts = { data: prompts(3), error: null }
    state.results.community_comments = commentResults([], { p0: 4, p2: 1 })
    const result = await getLessonPrompts(ARGS)

    const counts = queriesOf('community_comments').filter((q) => isCount(q.calls))
    expect(counts).toHaveLength(3)
    counts.forEach((q, i) => {
      expect(q.calls).toEqual(
        expect.arrayContaining([
          ['eq', 'tenant_id', TENANT],
          ['eq', 'post_id', `p${i}`],
          ['eq', 'is_hidden', false],
          ['is', 'parent_comment_id', null],
          ['not', 'author_id', 'in', '(b1)'],
        ])
      )
    })
    expect(result.enabled && result.prompts.map((p) => [p.id, p.answer_count])).toEqual([
      ['p0', 4],
      ['p1', 0],
      ['p2', 1],
    ])
  })

  it('throws when a count fails instead of showing a wrong number', async () => {
    state.results.community_posts = { data: prompts(2), error: null }
    state.results.community_comments = (calls) =>
      isCount(calls) ? { data: null, error: new Error('count down'), count: null } : { data: [], error: null }
    await expect(getLessonPrompts(ARGS)).rejects.toThrow('count down')
  })

  it('tells every read apart, so a cached render can be recognised', async () => {
    const a = await getLessonPrompts(ARGS)
    const b = await getLessonPrompts(ARGS)
    expect(a.enabled && b.enabled && a.loadId !== b.loadId).toBe(true)
  })

  it('throws on a failed read instead of reporting no prompts', async () => {
    state.rpc = { data: null, error: new Error('rpc down') }
    await expect(getLessonPrompts(ARGS)).rejects.toThrow('rpc down')

    state.rpc = { data: true, error: null }
    state.results.community_posts = { data: null, error: new Error('posts down') }
    await expect(getLessonPrompts(ARGS)).rejects.toThrow('posts down')
  })
})

describe('getLessonPromptCounts', () => {
  const supabase = client as unknown as Parameters<typeof getLessonPromptCounts>[0]

  it('counts visible prompts per lesson of this school’s course', async () => {
    state.results.community_posts = {
      data: [{ lesson_id: 1 }, { lesson_id: 2 }, { lesson_id: 1 }, { lesson_id: null }],
      error: null,
    }
    const counts = await getLessonPromptCounts(supabase, { tenantId: TENANT, courseId: 2001 })
    expect(counts && Object.fromEntries(counts)).toEqual({ 1: 2, 2: 1 })

    const [posts] = queriesOf('community_posts')
    expect(posts.calls).toEqual(
      expect.arrayContaining([
        ['eq', 'tenant_id', TENANT],
        ['eq', 'course_id', 2001],
        ['eq', 'post_type', 'discussion_prompt'],
        ['eq', 'is_hidden', false],
        ['not', 'lesson_id', 'is', null],
      ])
    )
  })

  it('is null when the plan has no community', async () => {
    state.rpc = { data: false, error: null }
    expect(await getLessonPromptCounts(supabase, { tenantId: TENANT, courseId: 2001 })).toBeNull()
  })

  it('is null, not an exception, when a read fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.results.community_posts = { data: null, error: new Error('boom') }
    expect(await getLessonPromptCounts(supabase, { tenantId: TENANT, courseId: 2001 })).toBeNull()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('visiblePostsQuery', () => {
  it('refuses a course feed without a course (never falls back to the school feed)', () => {
    expect(() =>
      visiblePostsQuery(client as never, { columns: 'id', tenantId: TENANT, scope: 'course', blockedIds: [] })
    ).toThrow()
    expect(queriesOf('community_posts')).toHaveLength(0)
  })

  it('reads the school feed as course_id IS NULL', () => {
    visiblePostsQuery(client as never, { columns: 'id', tenantId: TENANT, scope: 'school', blockedIds: [] })
    const [posts] = queriesOf('community_posts')
    expect(posts.calls).toContainEqual(['is', 'course_id', null])
  })
})

describe('getFeedPage({ postId })', () => {
  it('narrows to that post and keeps the tenant, hidden, scope and blocked filters', async () => {
    state.blocked = ['b1']
    await getFeedPage({ tenantId: TENANT, viewerId: VIEWER, scope: 'course', courseId: 2001, postId: POST_ID })
    const [posts] = queriesOf('community_posts')
    expect(posts.calls).toEqual(
      expect.arrayContaining([
        ['eq', 'tenant_id', TENANT],
        ['eq', 'is_hidden', false],
        ['eq', 'course_id', 2001],
        ['not', 'author_id', 'in', '(b1)'],
        ['eq', 'id', POST_ID],
      ])
    )
  })
})

describe('getFeedFocus', () => {
  const row = {
    id: POST_ID,
    author_id: 'teacher',
    post_type: 'discussion_prompt',
    title: 'Q',
    content: 'Why?',
    media_urls: [],
    is_pinned: false,
    is_locked: false,
    comment_count: 0,
    reaction_count: 0,
    created_at: '2020-01-01T00:00:00Z',
    course_id: 2001,
    lesson_id: 3001,
    is_graded: false,
    milestone_type: null,
    milestone_data: null,
  }

  it('does nothing for a missing or malformed param', async () => {
    expect(await getFeedFocus(undefined, { tenantId: TENANT, viewerId: VIEWER, scope: 'school' })).toEqual({
      focusPostId: null,
      focusPost: null,
    })
    expect(await getFeedFocus("1' or 1=1", { tenantId: TENANT, viewerId: VIEWER, scope: 'school' })).toEqual({
      focusPostId: null,
      focusPost: null,
    })
    expect(state.queries).toHaveLength(0)
  })

  it('looks the post up in THIS course feed and returns it enriched', async () => {
    state.results.community_posts = (calls) =>
      calls.some(([m, c, v]) => m === 'eq' && c === 'course_id' && v === 2001)
        ? { data: [row], error: null }
        : { data: [], error: null }

    const focus = await getFeedFocus(POST_ID, { tenantId: TENANT, viewerId: VIEWER, scope: 'course', courseId: 2001 })
    expect(focus.focusPostId).toBe(POST_ID)
    expect(focus.focusPost).toMatchObject({ id: POST_ID, author: { id: 'teacher' }, user_reactions: [] })

    const [posts] = queriesOf('community_posts')
    expect(posts.calls).toContainEqual(['eq', 'id', POST_ID])
    expect(posts.calls).toContainEqual(['eq', 'course_id', 2001])
  })

  it('reports a post it cannot find as unavailable', async () => {
    const focus = await getFeedFocus(POST_ID, { tenantId: TENANT, viewerId: VIEWER, scope: 'course', courseId: 2002 })
    expect(focus).toEqual({ focusPostId: POST_ID, focusPost: null })
  })

  it('never throws: a failed lookup is an unavailable post', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.results.community_posts = { data: null, error: new Error('boom') }
    const focus = await getFeedFocus(POST_ID, { tenantId: TENANT, viewerId: VIEWER, scope: 'school' })
    expect(focus).toEqual({ focusPostId: POST_ID, focusPost: null })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
