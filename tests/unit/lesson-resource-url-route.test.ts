/**
 * `GET /api/lessons/:lessonId/resources/:resourceId/url` (#848) and the gate
 * it shares with the web action, `signLessonResourceDownload`.
 *
 * What is proven: nothing is signed unless the resource is in the caller's
 * school AND in the named lesson, and the caller is the course author, an
 * active school admin, or holds course access; a resource in another school is
 * a 404 (its existence is not confirmed); DB and storage failures are 500s.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const TENANT = '00000000-0000-0000-0000-000000000002'
const OTHER_TENANT = '00000000-0000-0000-0000-000000000001'

const state = vi.hoisted(() => ({
  auth: null as { user: { id: string }; tenantId: string } | null,
  resources: [] as Row[],
  memberships: [] as Row[],
  access: false,
  readError: null as { message: string } | null,
  signError: null as { message: string } | null,
  signed: [] as { bucket: string; path: string; ttl: number }[],
  rpcCalls: [] as Row[],
}))

function builder(table: string) {
  const eqs: [string, unknown][] = []
  const source = (): Row[] =>
    table === 'lesson_resources' ? state.resources : table === 'tenant_users' ? state.memberships : []
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
    maybeSingle: () =>
      Promise.resolve(
        state.readError && table === 'lesson_resources'
          ? { data: null, error: state.readError }
          : { data: source().find((r) => eqs.every(([c, v]) => r[c] === v)) ?? null, error: null }
      ),
  }
  return b
}

const admin = {
  from: (t: string) => builder(t),
  rpc: (fn: string, args: Row) => {
    state.rpcCalls.push({ fn, ...args })
    return Promise.resolve({ data: state.access, error: null })
  },
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: (path: string, ttl: number) => {
        state.signed.push({ bucket, path, ttl })
        return Promise.resolve(
          state.signError
            ? { data: null, error: state.signError }
            : { data: { signedUrl: `https://storage.test/${path}?token=t` }, error: null }
        )
      },
    }),
  },
}

vi.mock('@/lib/supabase/api-auth', () => ({ getApiAuthContext: () => Promise.resolve(state.auth) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

import { GET } from '@/app/api/lessons/[lessonId]/resources/[resourceId]/url/route'
import { RESOURCE_URL_TTL_SECONDS } from '@/lib/lessons/resource-download'

const RESOURCE = {
  id: 7,
  file_path: `${TENANT}/2001/abc.pdf`,
  file_name: 'Syllabus.pdf',
  mime_type: 'application/pdf',
  lesson_id: 2001,
  tenant_id: TENANT,
  lessons: { course_id: 2001, courses: { author_id: 'author-1' } },
}

function get(lessonId: string | number, resourceId: string | number) {
  return GET(new Request(`http://t/api/lessons/${lessonId}/resources/${resourceId}/url`), {
    params: Promise.resolve({ lessonId: String(lessonId), resourceId: String(resourceId) }),
  })
}

beforeEach(() => {
  state.auth = { user: { id: 'student-1' }, tenantId: TENANT }
  state.resources = [RESOURCE]
  state.memberships = []
  state.access = false
  state.readError = null
  state.signError = null
  state.signed = []
  state.rpcCalls = []
})

describe('GET /api/lessons/:lessonId/resources/:resourceId/url', () => {
  it('401s without a caller', async () => {
    state.auth = null
    expect((await get(2001, 7)).status).toBe(401)
    expect(state.signed).toEqual([])
  })

  it('400s ids that are not positive integers', async () => {
    for (const [l, r] of [['abc', 7], [2001, '7.5'], [0, 7], [2001, '-1'], [2001, '1e3']] as const) {
      expect((await get(l, r)).status).toBe(400)
    }
    expect(state.signed).toEqual([])
  })

  it('signs a short-lived URL for a student with course access', async () => {
    state.access = true
    const res = await get(2001, 7)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).toEqual({
      url: `https://storage.test/${RESOURCE.file_path}?token=t`,
      expiresIn: RESOURCE_URL_TTL_SECONDS,
      fileName: 'Syllabus.pdf',
      mimeType: 'application/pdf',
    })
    expect(state.signed).toEqual([{ bucket: 'lesson-resources', path: RESOURCE.file_path, ttl: RESOURCE_URL_TTL_SECONDS }])
    expect(RESOURCE_URL_TTL_SECONDS).toBeLessThanOrEqual(600)
    expect(state.rpcCalls).toEqual([{ fn: 'has_course_access', _user_id: 'student-1', _course_id: 2001 }])
  })

  it('403s a student without course access and signs nothing', async () => {
    const res = await get(2001, 7)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('access_denied')
    expect(state.signed).toEqual([])
  })

  it("404s another school's resource without checking access", async () => {
    state.access = true
    state.resources = [{ ...RESOURCE, tenant_id: OTHER_TENANT }]
    const res = await get(2001, 7)
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('not_found')
    expect(state.signed).toEqual([])
    expect(state.rpcCalls).toEqual([])
  })

  it('404s a resource named under the wrong lesson', async () => {
    state.access = true
    expect((await get(2002, 7)).status).toBe(404)
    expect(state.signed).toEqual([])
  })

  it('404s an unknown resource', async () => {
    state.access = true
    expect((await get(2001, 8)).status).toBe(404)
  })

  it('lets the course author download without an entitlement', async () => {
    state.auth = { user: { id: 'author-1' }, tenantId: TENANT }
    expect((await get(2001, 7)).status).toBe(200)
    expect(state.rpcCalls).toEqual([])
  })

  it('lets an active admin of the school download without an entitlement', async () => {
    state.auth = { user: { id: 'admin-1' }, tenantId: TENANT }
    state.memberships = [{ tenant_id: TENANT, user_id: 'admin-1', role: 'admin', status: 'active' }]
    expect((await get(2001, 7)).status).toBe(200)
  })

  it("does not treat a removed admin, a teacher, or another school's admin as an admin", async () => {
    state.auth = { user: { id: 'admin-1' }, tenantId: TENANT }
    for (const m of [
      { tenant_id: TENANT, user_id: 'admin-1', role: 'admin', status: 'removed' },
      { tenant_id: TENANT, user_id: 'admin-1', role: 'teacher', status: 'active' },
      { tenant_id: OTHER_TENANT, user_id: 'admin-1', role: 'admin', status: 'active' },
    ]) {
      state.memberships = [m]
      expect((await get(2001, 7)).status).toBe(403)
    }
    expect(state.signed).toEqual([])
  })

  it('500s when the lookup fails', async () => {
    state.readError = { message: 'connection reset' }
    const res = await get(2001, 7)
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('failed')
  })

  it('500s when storage cannot sign', async () => {
    state.access = true
    state.signError = { message: 'Object not found' }
    expect((await get(2001, 7)).status).toBe(500)
  })
})
