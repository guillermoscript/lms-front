/**
 * landing-data resolvers (Page Architect WP3, design §4 + corrections C4/D1/D3).
 *
 * The admin client is replaced by an in-memory query builder that APPLIES the
 * filters the code asks for (eq/in/is/order/limit) over fixtures that mix two
 * tenants, drafts, deleted rows and scheduled lessons. So a missing
 * `.eq('tenant_id')` leaks a foreign row into the result and fails the test —
 * on top of the explicit per-chain assertions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Call = { method: string; args: unknown[] }
type Chain = { table: string; calls: Call[] }

const T = 'tenant-a'
const OTHER = 'tenant-b'
const chains: Chain[] = []
let db: Record<string, Row[]> = {}

function apply(chain: Chain): { data: Row[]; count: number } {
  let rows = [...(db[chain.table] ?? [])]
  let head = false
  for (const { method, args } of chain.calls) {
    const [col, val] = args as [string, unknown]
    if (method === 'eq') rows = rows.filter((r) => r[col] === val)
    else if (method === 'in') rows = rows.filter((r) => (val as unknown[]).includes(r[col]))
    else if (method === 'is') rows = rows.filter((r) => (r[col] ?? null) === val)
    else if (method === 'not') rows = rows.filter((r) => r[col] != null)
    else if (method === 'order') {
      const asc = (args[1] as { ascending?: boolean } | undefined)?.ascending !== false
      rows.sort((a, b) => ((a[col] as number) > (b[col] as number) ? 1 : -1) * (asc ? 1 : -1))
    } else if (method === 'limit') rows = rows.slice(0, args[0] as number)
    else if (method === 'select') head = !!(args[1] as { head?: boolean } | undefined)?.head
  }
  return { data: head ? [] : rows, count: rows.length }
}

function builder(table: string) {
  const chain: Chain = { table, calls: [] }
  chains.push(chain)
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(apply(chain)).then(res, rej)
        }
        return (...args: unknown[]) => {
          chain.calls.push({ method: String(prop), args })
          return proxy
        }
      },
    }
  )
  return proxy
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock('@/lib/settings/free-preview', () => ({
  isFreePreviewEnabled: vi.fn(async () => true),
}))

const {
  getLandingData,
  getLandingCourseDetailsByIds,
  getLandingProducts,
  getLandingPlans,
  LESSON_COLUMNS,
  REVIEWER_COLUMNS,
} = await import('@/lib/puck/utils/landing-data')

const PAST = '2020-01-01T00:00:00Z'
const FUTURE = '2999-01-01T00:00:00Z'

function course(id: number, extra: Row = {}): Row {
  return {
    course_id: id,
    tenant_id: T,
    title: `Course ${id}`,
    description: `About ${id}`,
    thumbnail_url: `https://img/${id}.png`,
    status: 'published',
    deleted_at: null,
    learning_objectives: [],
    author_id: null,
    ...extra,
  }
}

function seed() {
  db = {
    courses: [
      // 26 published courses → id 1 falls outside the latest-24 window.
      ...Array.from({ length: 26 }, (_, i) => course(i + 1)),
      course(1, {
        learning_objectives: ['Build a form', '  ', 'Ship it'],
        author_id: 'author-1',
      }),
      course(90, { status: 'draft', title: 'Draft course' }),
      course(91, { deleted_at: '2024-01-01' }),
      course(92, { status: 'archived' }),
      course(500, { tenant_id: OTHER, title: 'Foreign course' }),
    ],
    product_courses: [
      { tenant_id: T, course_id: 1, product_id: 40, products: { price: 49, currency: 'usd', status: 'active' } },
      { tenant_id: T, course_id: 1, product_id: 41, products: { price: 19, currency: 'usd', status: 'inactive' } },
      { tenant_id: T, course_id: 2, product_id: 42, products: { price: 0, currency: 'usd', status: 'active' } },
      { tenant_id: T, course_id: 3, product_id: 43, products: { price: 10, currency: 'usd', status: 'active' } },
      { tenant_id: T, course_id: 4, product_id: 43, products: { price: 10, currency: 'usd', status: 'active' } },
      { tenant_id: OTHER, course_id: 500, product_id: 99, products: { price: 5, currency: 'usd', status: 'active' } },
    ],
    lessons: [
      { id: 1001, tenant_id: T, course_id: 1, title: 'Intro', sequence: 1, is_preview: true, status: 'published', publish_at: null, content: 'SECRET' },
      { id: 1002, tenant_id: T, course_id: 1, title: 'Forms', sequence: 2, is_preview: false, status: 'published', publish_at: PAST, content: 'SECRET' },
      { id: 1003, tenant_id: T, course_id: 1, title: 'Scheduled', sequence: 3, is_preview: false, status: 'published', publish_at: FUTURE, content: 'SECRET' },
      { id: 1004, tenant_id: T, course_id: 1, title: 'Draft lesson', sequence: 4, is_preview: false, status: 'draft', publish_at: null, content: 'SECRET' },
      { id: 1005, tenant_id: OTHER, course_id: 1, title: 'Foreign lesson', sequence: 5, is_preview: true, status: 'published', publish_at: null },
    ],
    reviews: [
      ...Array.from({ length: 8 }, (_, i) => ({
        review_id: 2000 + i,
        user_id: `student-${i}`,
        entity_type: 'courses',
        entity_id: 1,
        rating: i % 2 ? 5 : 4,
        review_text: `Great ${i}`,
        created_at: `2024-01-0${(i % 9) + 1}`,
      })),
      { review_id: 2100, user_id: 'student-x', entity_type: 'courses', entity_id: 1, rating: 3, review_text: null, created_at: '2023-01-01' },
      { review_id: 2200, user_id: 'student-y', entity_type: 'courses', entity_id: 500, rating: 1, review_text: 'Foreign', created_at: '2024-02-01' },
    ],
    profiles: [
      { id: 'author-1', full_name: 'Ana Real', avatar_url: 'https://img/ana.png', bio: 'Teaches forms.' },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `student-${i}`, full_name: `Student ${i}`, avatar_url: null, bio: 'private bio' })),
    ],
    products: [
      { product_id: 40, tenant_id: T, name: 'Solo', description: 'One course', price: 49, currency: 'usd', image: null, status: 'active', created_at: 3 },
      { product_id: 43, tenant_id: T, name: 'Bundle', description: 'Two courses', price: 10, currency: 'usd', image: null, status: 'active', created_at: 2 },
      { product_id: 41, tenant_id: T, name: 'Old', description: null, price: 19, currency: 'usd', image: null, status: 'inactive', created_at: 1 },
      { product_id: 99, tenant_id: OTHER, name: 'Foreign', description: null, price: 5, currency: 'usd', image: null, status: 'active', created_at: 9 },
    ],
    plans: [
      { plan_id: 8, tenant_id: T, plan_name: 'Monthly', price: 9, currency: 'usd', duration_in_days: 30, features: 'A\nB', description: ' All courses ', deleted_at: null },
      { plan_id: 9, tenant_id: T, plan_name: 'Gone', price: 1, currency: 'usd', duration_in_days: 30, features: null, description: null, deleted_at: '2024-01-01' },
      { plan_id: 10, tenant_id: OTHER, plan_name: 'Foreign', price: 1, currency: 'usd', duration_in_days: 30, features: null, description: null, deleted_at: null },
    ],
    enrollments: [],
    lesson_completions: [],
    tenant_users: [],
  }
  // Keep exactly one row per course id (the specialised course(1) replaces the generic one).
  const byId = new Map<unknown, Row>()
  for (const c of db.courses) byId.set(c.course_id, c)
  db.courses = [...byId.values()]
}

const TENANT_TABLES = ['courses', 'lessons', 'products', 'product_courses', 'plans', 'enrollments', 'tenant_users']
const FORBIDDEN_LESSON_COLUMNS = ['content', 'transcript', 'embed_code', 'video_url', 'ai_task_instructions']

function selectOf(chain: Chain): string {
  return String(chain.calls.find((c) => c.method === 'select')?.args[0] ?? '')
}

function assertSafeChains() {
  expect(chains.length).toBeGreaterThan(0)
  for (const chain of chains) {
    if (TENANT_TABLES.includes(chain.table)) {
      expect(chain.calls, `${chain.table} must filter by tenant`).toContainEqual({ method: 'eq', args: ['tenant_id', T] })
    }
    if (chain.table === 'lessons') {
      const cols = selectOf(chain)
      for (const bad of FORBIDDEN_LESSON_COLUMNS) expect(cols).not.toMatch(new RegExp(`\\b${bad}\\b`))
      expect(chain.calls).toContainEqual({ method: 'in', args: ['course_id', expect.any(Array)] })
    }
    if (chain.table === 'courses') {
      expect(chain.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] })
      const statusFilter = chain.calls.find((c) => (c.method === 'eq' || c.method === 'in') && c.args[0] === 'status')
      expect(statusFilter, 'courses must filter by status').toBeTruthy()
    }
    if (chain.table === 'products') {
      expect(chain.calls).toContainEqual({ method: 'eq', args: ['status', 'active'] })
    }
    if (chain.table === 'plans') {
      expect(chain.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] })
    }
    if (chain.table === 'reviews') {
      // No tenant_id column: must be keyed by the tenant's own course ids.
      const inCall = chain.calls.find((c) => c.method === 'in' && c.args[0] === 'entity_id')
      expect(inCall).toBeTruthy()
      expect(inCall!.args[1] as number[]).not.toContain(500)
    }
    if (chain.table === 'profiles') {
      expect(chain.calls.find((c) => c.method === 'in' && c.args[0] === 'id')).toBeTruthy()
      expect(selectOf(chain)).not.toMatch(/\bemail\b/)
    }
  }
}

beforeEach(() => {
  chains.length = 0
  seed()
})

describe('getLandingData', () => {
  it('without puckData: latest-24 published courses, no details, tenant-filtered everywhere', async () => {
    const data = await getLandingData(T)
    expect(data.courses).toHaveLength(24)
    expect(data.courses.every((c) => c.status === 'published')).toBe(true)
    const ids = data.courses.map((c) => c.id)
    expect(ids).not.toContain('1') // outside the window
    for (const hidden of ['90', '91', '92', '500']) expect(ids).not.toContain(hidden)
    expect(data.courseDetails).toEqual({})
    assertSafeChains()
  })

  it('unions referenced ids beyond the window and resolves details for single bindings (D1)', async () => {
    const puckData = {
      content: [
        { type: 'CourseHero', props: { id: 'CourseHero-1', courseId: '1' } },
        { type: 'CourseGrid', props: { id: 'CourseGrid-1', courseIds: [{ id: '2' }, { id: '500' }] } },
      ],
      zones: { 'Columns-1:a': [{ type: 'EnrollCta', props: { id: 'EnrollCta-1', courseId: 500 } }] },
    }
    const data = await getLandingData(T, { puckData })

    expect(data.courses.map((c) => c.id)).toContain('1')
    expect(data.courses.map((c) => c.id)).not.toContain('500')
    expect(Object.keys(data.courseDetails)).toEqual(['1'])

    const d = data.courseDetails['1']
    // base fields (D1)
    expect(d).toMatchObject({ id: '1', title: 'Course 1', image: 'https://img/1.png', price: 49, currency: 'usd', status: 'published' })
    expect(d.objectives).toEqual(['Build a form', 'Ship it'])
    // lessons: published + schedule passed, own tenant only, titles only (D3)
    expect(d.lessons.map((l) => l.title)).toEqual(['Intro', 'Forms'])
    expect(d.lessons[0]).toEqual({ id: '1001', title: 'Intro', sequence: 1, isPreview: true })
    expect(JSON.stringify(d)).not.toContain('SECRET')
    expect(d.lessonCount).toBe(2)
    expect(d.previewEnabled).toBe(true)
    // author from profiles; reviews real, capped, no foreign ones
    expect(d.author).toEqual({ id: 'author-1', name: 'Ana Real', avatar: 'https://img/ana.png', bio: 'Teaches forms.' })
    expect(d.rating.count).toBe(9)
    expect(d.reviews).toHaveLength(6)
    expect(d.reviews.every((r) => r.quote.startsWith('Great'))).toBe(true)
    assertSafeChains()
  })

  it('a draft binding: absent publicly, flagged with includeDrafts — never in the courses list (C4)', async () => {
    const puckData = { content: [{ type: 'CourseHero', props: { courseId: '90' } }] }
    const pub = await getLandingData(T, { puckData })
    expect(pub.courseDetails['90']).toBeUndefined()
    expect(pub.courses.map((c) => c.id)).not.toContain('90')

    const editor = await getLandingData(T, { puckData, includeDrafts: true })
    expect(editor.courseDetails['90']).toMatchObject({ status: 'draft', title: 'Draft course' })
    expect(editor.courses.map((c) => c.id)).not.toContain('90')
  })

  it('reviewer profiles never carry bio; authors may', async () => {
    await getLandingData(T, { puckData: { content: [{ type: 'CourseHero', props: { courseId: '1' } }] } })
    const profileSelects = chains.filter((c) => c.table === 'profiles').map(selectOf)
    expect(profileSelects).toContain(REVIEWER_COLUMNS)
    expect(REVIEWER_COLUMNS).not.toMatch(/bio/)
  })

  it('one failing resolver degrades to its default instead of throwing', async () => {
    const original = db.plans
    Object.defineProperty(db, 'plans', {
      get() {
        throw new Error('boom')
      },
      configurable: true,
    })
    const data = await getLandingData(T)
    expect(data.plans).toEqual([])
    expect(data.courses.length).toBeGreaterThan(0)
    Object.defineProperty(db, 'plans', { value: original, configurable: true, writable: true })
  })
})

describe('getLandingCourseDetailsByIds', () => {
  it('drops foreign / deleted / archived ids and caps at 10', async () => {
    const out = await getLandingCourseDetailsByIds(T, ['500', '91', '92', 'abc', '1'])
    expect(Object.keys(out)).toEqual(['1'])
    const many = await getLandingCourseDetailsByIds(T, Array.from({ length: 15 }, (_, i) => String(i + 1)))
    expect(Object.keys(many)).toHaveLength(10)
    assertSafeChains()
  })

  it('selects only the safe lesson columns', () => {
    for (const bad of FORBIDDEN_LESSON_COLUMNS) expect(LESSON_COLUMNS).not.toMatch(new RegExp(`\\b${bad}\\b`))
  })
})

describe('getLandingProducts', () => {
  it('newest active products of this tenant, with linked courses and the right href', async () => {
    const products = await getLandingProducts(T)
    expect(products.map((p) => p.id)).toEqual(['40', '43'])
    expect(products[0]).toMatchObject({ name: 'Solo', courseIds: ['1'], href: '/checkout?courseId=1&productId=40', price: 49 })
    expect(products[1]).toMatchObject({ name: 'Bundle', courseIds: ['3', '4'], href: '/products/43' })
    assertSafeChains()
  })

  it('by ids: foreign and inactive ids come back absent', async () => {
    const products = await getLandingProducts(T, { ids: ['99', '41', '43', 'x'] })
    expect(products.map((p) => p.id)).toEqual(['43'])
    assertSafeChains()
  })
})

describe('getLandingPlans', () => {
  it('maps description, drops deleted and foreign plans', async () => {
    const plans = await getLandingPlans(T)
    expect(plans).toEqual([
      {
        id: '8',
        name: 'Monthly',
        price: 9,
        currency: 'usd',
        interval: 'month',
        features: ['A', 'B'],
        description: 'All courses',
        href: '/checkout?planId=8',
        highlighted: false,
      },
    ])
    assertSafeChains()
  })
})
