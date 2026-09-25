/**
 * Native school switch/join over Bearer — issue #845.
 *
 * The app has no subdomain, so proxy.ts never stamps its JWT's school.
 * `POST /api/tenant/switch` does it: a member is switched, a non-member is
 * joined only where the web would join them without asking (member of
 * nothing, or invited) or after `join: true`, and the plan's student cap is
 * a 409. The proof that it worked is the claim in the REFRESHED token, which
 * is what every RLS read in the app keys on.
 *
 * Owns QA tenant `…0845` on a hidden plan with `max_students: 1`, so one join
 * fills it. Alice's claim is put back on Code Academy afterwards — other specs
 * sign her in there.
 */
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BASE } from './utils/constants'
import {
  SEEDED,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  upsertTinyPlan,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const CODE_ACADEMY = '00000000-0000-0000-0000-000000000002'
const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000845',
  slug: 'qa-tenant-switch-845',
  name: 'QA Tenant Switch 845',
  planSlug: 'e2e-tenant-switch-845',
}
const FRESH = { email: 'e2e-845-fresh@e2etest.com', password: 'password123' }

function anon(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function claims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

async function signIn(account: { email: string; password: string }) {
  const client = anon()
  const { data, error } = await client.auth.signInWithPassword(account)
  expect(error).toBeNull()
  return { client, token: data.session!.access_token }
}

/** What the app does after a successful switch. */
async function refreshedClaims(client: SupabaseClient) {
  const { data, error } = await client.auth.refreshSession()
  expect(error).toBeNull()
  return claims(data.session!.access_token)
}

async function deleteFresh(admin: SupabaseClient) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = data?.users.find((u) => u.email === FRESH.email)
  if (!user) return
  await admin.from('gamification_profiles').delete().eq('user_id', user.id)
  await admin.from('tenant_users').delete().eq('user_id', user.id)
  await admin.auth.admin.deleteUser(user.id)
}

async function reset(admin: SupabaseClient) {
  await deleteFresh(admin)
  await admin.from('gamification_profiles').delete().eq('tenant_id', QA.id)
  await destroyQaTenant(admin, QA)
  await admin.auth.admin.updateUserById(SEEDED.alice.id, {
    app_metadata: { tenant_id: CODE_ACADEMY },
    user_metadata: { preferred_tenant_id: CODE_ACADEMY },
  })
}

test.describe('POST /api/tenant/switch (#845)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    const admin = getAdmin()
    await reset(admin)
    await upsertTinyPlan(admin, QA.planSlug, { max_courses: 5, max_students: 1 })
    await createQaTenant(admin, QA, QA.planSlug)
  })

  test.afterAll(async () => {
    await reset(getAdmin())
  })

  test('401 without a token', async ({ request }) => {
    const res = await request.post(`${BASE}/api/tenant/switch`, { data: { slug: QA.slug } })
    expect(res.status()).toBe(401)
  })

  test('a member of another school is asked first, then joined on confirm', async ({ request }) => {
    const admin = getAdmin()
    const { client, token } = await signIn(SEEDED.alice)
    const headers = { Authorization: `Bearer ${token}` }

    const asked = await request.post(`${BASE}/api/tenant/switch`, { headers, data: { slug: QA.slug } })
    expect(asked.status()).toBe(409)
    expect(await asked.json()).toMatchObject({ code: 'join_required', school: { tenantId: QA.id, slug: QA.slug } })
    const { count: before } = await admin
      .from('tenant_users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', QA.id)
    expect(before).toBe(0)

    const joined = await request.post(`${BASE}/api/tenant/switch`, { headers, data: { slug: QA.slug, join: true } })
    expect(joined.status()).toBe(200)
    expect(await joined.json()).toMatchObject({ tenantId: QA.id, role: 'student', joined: true })

    const c = await refreshedClaims(client)
    expect(c.tenant_id).toBe(QA.id)
    expect(c.tenant_role).toBe('student')

    const list = await request.get(`${BASE}/api/tenant/memberships`, { headers })
    const body = await list.json()
    expect(body.activeTenantId).toBe(QA.id)
    expect(body.memberships.map((m: { tenantId: string }) => m.tenantId).sort()).toEqual([CODE_ACADEMY, QA.id].sort())
  })

  test('a member switches back without spending a seat', async ({ request }) => {
    const { client, token } = await signIn(SEEDED.alice)
    const res = await request.post(`${BASE}/api/tenant/switch`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { tenantId: CODE_ACADEMY },
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ tenantId: CODE_ACADEMY, joined: false })
    expect((await refreshedClaims(client)).tenant_id).toBe(CODE_ACADEMY)
  })

  test('a member of nothing is refused at the cap, then joined without asking', async ({ request }) => {
    const admin = getAdmin()
    const { error } = await admin.auth.admin.createUser({ ...FRESH, email_confirm: true })
    expect(error).toBeNull()
    const { client, token } = await signIn(FRESH)
    const headers = { Authorization: `Bearer ${token}` }

    // Alice took the only seat.
    const full = await request.post(`${BASE}/api/tenant/switch`, { headers, data: { slug: QA.slug } })
    expect(full.status()).toBe(409)
    expect((await full.json()).code).toBe('student_limit')

    await upsertTinyPlan(admin, QA.planSlug, { max_courses: 5, max_students: 2 })
    const res = await request.post(`${BASE}/api/tenant/switch`, { headers, data: { slug: QA.slug } })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ tenantId: QA.id, role: 'student', joined: true })
    expect((await refreshedClaims(client)).tenant_id).toBe(QA.id)
  })
})
