/**
 * The landing-page save path is the security boundary (Page Architect critique C1/C2/F4).
 *
 * - `validateLandingPuckData`: lenient core `validatePage` (legacy props pass; unsafe URLs,
 *   unknown block types and duplicate ids fail) plus ref ownership (another school's course /
 *   product / plan id fails; an id that matches no row passes).
 * - `updateLandingPage`: validates before writing, compares-and-swaps on `updated_at` with a
 *   row-count check, and returns the new `updated_at`.
 *
 * The admin client is an in-memory query builder that applies the filters the code asks for,
 * over rows from two tenants.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Call = { method: string; args: unknown[] }

const T = 'tenant-a'
const OTHER = 'tenant-b'
const chains: Array<{ table: string; calls: Call[] }> = []
let db: Record<string, Row[]> = {}

function run(table: string, calls: Call[]): { data: unknown; error: null } {
  let rows = [...(db[table] ?? [])]
  let update: Row | null = null
  let insert: Row | null = null
  let single = false
  for (const { method, args } of calls) {
    const [col, val] = args as [string, unknown]
    if (method === 'eq') rows = rows.filter((r) => r[col] === val)
    else if (method === 'in') rows = rows.filter((r) => (val as unknown[]).includes(r[col]))
    else if (method === 'update') update = args[0] as Row
    else if (method === 'insert') insert = args[0] as Row
    else if (method === 'single' || method === 'maybeSingle') single = true
  }
  if (insert) {
    const row = { page_id: 'new-page', created_at: 'now', updated_at: '2026-10-08T10:00:00.000+00:00', ...insert }
    db[table] = [...(db[table] ?? []), row]
    return { data: single ? row : [row], error: null }
  }
  if (update) {
    for (const r of rows) Object.assign(r, update)
    return { data: single ? (rows[0] ?? null) : rows, error: null }
  }
  return { data: single ? (rows[0] ?? null) : rows, error: null }
}

function builder(table: string) {
  const chain = { table, calls: [] as Call[] }
  chains.push(chain)
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(run(table, chain.calls)).then(res, rej)
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

const admin = {
  from: (table: string) => builder(table),
  rpc: async () => ({ data: { plan: 'pro' }, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
  verifyAdminAccess: vi.fn(async () => true),
}))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: vi.fn(async () => T),
  getCurrentUserId: vi.fn(async () => 'user-1'),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/analytics/server', () => ({ track: vi.fn(), safeAnalytics: vi.fn() }))

const { validateLandingPuckData, collectRefIds } = await import('@/app/actions/admin/landing-page-validation')
const { updateLandingPage, createLandingPage } = await import('@/app/actions/admin/landing-pages')

const STAMP = '2026-10-08T09:00:00.123+00:00'

function hero(id: string, props: Row = {}) {
  return { type: 'HeroBlock', props: { id, title: 'Hi', primaryCtaHref: '/courses', ...props } }
}
function pageOf(...content: Array<{ type: string; props: Row }>) {
  return { root: { props: {} }, content, zones: {} }
}

beforeEach(() => {
  chains.length = 0
  db = {
    courses: [
      { course_id: 1, tenant_id: T },
      { course_id: 2, tenant_id: OTHER },
    ],
    products: [
      { product_id: 10, tenant_id: T },
      { product_id: 20, tenant_id: OTHER },
    ],
    plans: [
      { plan_id: 5, tenant_id: T },
      { plan_id: 6, tenant_id: OTHER },
    ],
    landing_pages: [
      {
        page_id: 'p1',
        tenant_id: T,
        title: 'Home',
        slug: 'home',
        puck_data: pageOf(),
        is_published: false,
        created_at: 'then',
        updated_at: STAMP,
      },
    ],
  }
})

describe('validateLandingPuckData (lenient page + ref ownership)', () => {
  it('accepts a normal page, legacy unknown props included', async () => {
    const page = pageOf(hero('h1', { someLegacyProp: { nested: true } }))
    await expect(validateLandingPuckData(admin, T, page)).resolves.toEqual({ ok: true })
  })

  it.each([
    ['javascript: link', hero('h1', { primaryCtaHref: 'javascript:alert(1)' })],
    ['protocol-relative link', hero('h1', { secondaryCtaHref: '//evil.example' })],
    ['data: image', hero('h1', { backgroundImage: 'data:image/png;base64,AAAA' })],
    ['unknown block type', { type: 'EvilBlock', props: { id: 'x' } }],
  ])('rejects a %s', async (_label, block) => {
    const result = await validateLandingPuckData(admin, T, pageOf(block))
    expect(result.ok).toBe(false)
  })

  it('rejects duplicate ids and a malformed page', async () => {
    expect((await validateLandingPuckData(admin, T, pageOf(hero('a'), hero('a')))).ok).toBe(false)
    expect((await validateLandingPuckData(admin, T, { content: 'nope' })).ok).toBe(false)
    expect((await validateLandingPuckData(admin, T, null)).ok).toBe(false)
  })

  it("rejects another school's course, product and plan ids", async () => {
    const course = await validateLandingPuckData(admin, T, pageOf({ type: 'CourseHero', props: { id: 'c', courseId: '2' } }))
    expect(course.ok).toBe(false)
    if (!course.ok) expect(course.errors.join(' ')).toMatch(/course/)

    const product = await validateLandingPuckData(admin, T, pageOf({ type: 'ProductGrid', props: { id: 'g', productIds: [{ id: '10' }, { id: '20' }] } }))
    expect(product.ok).toBe(false)
    if (!product.ok) expect(product.errors.join(' ')).toMatch(/20/)

    const plan = await validateLandingPuckData(admin, T, pageOf({ type: 'PricingTable', props: { id: 'p', planIds: [{ id: '6' }] } }))
    expect(plan.ok).toBe(false)
  })

  it('accepts own ids and ids that match no row (a deleted course renders nothing)', async () => {
    const page = pageOf(
      { type: 'CourseHero', props: { id: 'c', courseId: 1 } },
      { type: 'ProductGrid', props: { id: 'g', productIds: [{ id: '10' }] } },
      { type: 'PricingTable', props: { id: 'p', planIds: ['5'] } },
      { type: 'CourseHero', props: { id: 'gone', courseId: '999' } }
    )
    await expect(validateLandingPuckData(admin, T, page)).resolves.toEqual({ ok: true })
    // One ownership lookup per referenced kind, by id.
    const lookups = chains.filter((c) => ['courses', 'products', 'plans'].includes(c.table))
    expect(lookups.map((c) => c.table).sort()).toEqual(['courses', 'plans', 'products'])
    for (const c of lookups) expect(c.calls.map((x) => x.method)).toEqual(['select', 'in'])
  })

  it('rejects a malformed ref id without querying with it', async () => {
    const result = await validateLandingPuckData(admin, T, pageOf({ type: 'CourseHero', props: { id: 'c', courseId: 'abc' } }))
    expect(result.ok).toBe(false)
    expect(chains.filter((c) => c.table === 'courses')).toHaveLength(0)
  })

  it('collects refs from DropZone children too', () => {
    const page = {
      root: { props: {} },
      content: [{ type: 'Columns', props: { id: 'cols' } }],
      zones: { 'cols:column-0': [{ type: 'CourseHero', props: { id: 'c', courseId: '1' } }] },
    }
    expect([...collectRefIds(page as never).course]).toEqual(['1'])
  })
})

describe('updateLandingPage (validation + compare-and-swap)', () => {
  it('saves when updated_at still matches and returns the new updated_at', async () => {
    const result = await updateLandingPage('p1', { puck_data: pageOf(hero('h1')) as never }, { expectedUpdatedAt: STAMP })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.updated_at).not.toBe(STAMP)
    const write = chains.find((c) => c.table === 'landing_pages' && c.calls.some((x) => x.method === 'update'))!
    expect(write.calls).toContainEqual({ method: 'eq', args: ['tenant_id', T] })
    expect(write.calls).toContainEqual({ method: 'eq', args: ['updated_at', STAMP] })
  })

  it('reports a conflict (and writes nothing) when the row changed since it was loaded', async () => {
    db.landing_pages[0].updated_at = '2026-10-08T09:30:00.000+00:00' // an MCP agent saved meanwhile
    const before = JSON.stringify(db.landing_pages[0].puck_data)
    const result = await updateLandingPage('p1', { puck_data: pageOf(hero('h1')) as never }, { expectedUpdatedAt: STAMP })
    expect(result).toMatchObject({ success: false, code: 'conflict' })
    expect(JSON.stringify(db.landing_pages[0].puck_data)).toBe(before)
  })

  it('overwrites without the CAS predicate when expectedUpdatedAt is null', async () => {
    db.landing_pages[0].updated_at = '2026-10-08T09:30:00.000+00:00'
    const result = await updateLandingPage('p1', { puck_data: pageOf(hero('h1')) as never }, { expectedUpdatedAt: null })
    expect(result.success).toBe(true)
    const write = chains.find((c) => c.calls.some((x) => x.method === 'update'))!
    expect(write.calls.some((x) => x.method === 'eq' && x.args[0] === 'updated_at')).toBe(false)
  })

  it('refuses an invalid page before touching the row', async () => {
    const result = await updateLandingPage(
      'p1',
      { puck_data: pageOf(hero('h1', { primaryCtaHref: 'javascript:alert(1)' })) as never },
      { expectedUpdatedAt: STAMP }
    )
    expect(result).toMatchObject({ success: false, code: 'invalid' })
    if (!result.success) expect(result.details?.length).toBeGreaterThan(0)
    expect(chains.some((c) => c.calls.some((x) => x.method === 'update'))).toBe(false)
  })

  it("refuses another school's course id on save", async () => {
    const result = await updateLandingPage(
      'p1',
      { puck_data: pageOf({ type: 'CourseHero', props: { id: 'c', courseId: '2' } }) as never },
      { expectedUpdatedAt: STAMP }
    )
    expect(result).toMatchObject({ success: false, code: 'invalid' })
  })

  it("never writes another tenant's page", async () => {
    db.landing_pages[0].tenant_id = OTHER
    const result = await updateLandingPage('p1', { puck_data: pageOf() as never }, { expectedUpdatedAt: STAMP })
    expect(result.success).toBe(false)
    expect(chains.some((c) => c.calls.some((x) => x.method === 'update'))).toBe(false)
  })
})

describe('createLandingPage validates too', () => {
  it('refuses a template copy with an unsafe link', async () => {
    const result = await createLandingPage('New', pageOf(hero('h1', { primaryCtaHref: 'javascript:x' })) as never, 'promo')
    expect(result).toMatchObject({ success: false, code: 'invalid' })
    expect(chains.some((c) => c.calls.some((x) => x.method === 'insert'))).toBe(false)
  })

  it('creates a valid page', async () => {
    const result = await createLandingPage('New', pageOf(hero('h1')) as never, 'promo')
    expect(result.success).toBe(true)
  })
})
