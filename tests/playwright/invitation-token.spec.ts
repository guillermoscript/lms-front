/**
 * Invitation tokens — an invitation is consumed ONLY by whoever presents its
 * secret token from the account whose email it was addressed to.
 *
 * Before 20261022190000_invitation_token, `joinSchool` matched a pending
 * invitation by email alone. Sign-up does not verify the address, so anyone who
 * registered the invitee's email first captured the invited role (teacher).
 *
 * API-level: every join goes through `POST /api/tenant/switch` (the same
 * `joinSchool` the web action uses) with a real Bearer token. Fixtures are
 * created under a unique marker with the service role and removed in afterAll.
 */
import { test, expect } from './utils/test'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { ACCOUNTS } from './utils/constants'

const TENANT_A = '00000000-0000-0000-0000-000000000001' // default
const TENANT_B = '00000000-0000-0000-0000-000000000002' // code-academy
const OWNER_ID = 'a1000000-0000-0000-0000-000000000002' // admin of A (invited_by)

const RUN = Date.now()
const PREFIX = `invtok-${RUN}`
const PASSWORD = 'Password123!'
const BASE = (process.env.BASE_URL ?? 'http://lvh.me:3005').replace(/\/$/, '')

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!

const admin: SupabaseClient = createSupabaseClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const createdUserIds: string[] = []
const email = (label: string) => `${PREFIX}-${label}@e2etest.com`
const randomToken = () => Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

async function makeUser(address: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser ${address}: ${error.message}`)
  createdUserIds.push(data.user.id)
  return data.user.id
}

async function makeInvite(opts: { tenant: string; address: string; role?: 'teacher' | 'student' | 'admin'; expiresAt?: string }) {
  const { data, error } = await admin
    .from('tenant_invitations')
    .insert({
      tenant_id: opts.tenant,
      email: opts.address,
      role: opts.role ?? 'teacher',
      invited_by: OWNER_ID,
      ...(opts.expiresAt ? { expires_at: opts.expiresAt } : {}),
    })
    .select('id, token')
    .single()
  if (error) throw new Error(`invite ${opts.address}: ${error.message}`)
  return data as { id: string; token: string }
}

/** Join `tenantId` as `address`, optionally presenting a token. */
async function join(address: string, tenantId: string, inviteToken?: string) {
  const client = createSupabaseClient(url(), anonKey(), { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: address, password: PASSWORD })
  expect(error, `sign-in ${address}`).toBeNull()
  const res = await fetch(`${BASE}/api/tenant/switch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session!.access_token}` },
    body: JSON.stringify({ tenantId, ...(inviteToken ? { inviteToken } : {}) }),
  })
  return { status: res.status, body: (await res.json()) as { role?: string; joined?: boolean; code?: string } }
}

async function roleIn(userId: string, tenantId: string) {
  const { data } = await admin
    .from('tenant_users')
    .select('role, status')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data
}

async function statusOf(id: string) {
  const { data } = await admin.from('tenant_invitations').select('status, accepted_at').eq('id', id).single()
  return data!
}

test.describe.configure({ mode: 'serial' })

test.describe('Invitation tokens', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'API-level; runs once')
  })

  test.afterAll(async () => {
    await admin.from('tenant_invitations').delete().like('email', `${PREFIX}-%`)
    for (const id of createdUserIds) {
      await admin.from('gamification_profiles').delete().eq('user_id', id)
      await admin.from('tenant_users').delete().eq('user_id', id)
      await admin.auth.admin.deleteUser(id)
    }
  })

  test('(a) registering the invitee address WITHOUT the token only yields a student', async () => {
    const address = email('a')
    const userId = await makeUser(address)
    const inv = await makeInvite({ tenant: TENANT_A, address })

    const { status, body } = await join(address, TENANT_A)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.role).toBe('student')
    expect((await roleIn(userId, TENANT_A))?.role).toBe('student')
    expect((await statusOf(inv.id)).status).toBe('pending')
  })

  test('(a2) an ADMIN invitation (school created on behalf) is not captured by registering the address first', async () => {
    const address = email('a2')
    const userId = await makeUser(address)
    const inv = await makeInvite({ tenant: TENANT_A, address, role: 'admin' })

    const { status, body } = await join(address, TENANT_A)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.role).toBe('student')
    expect((await roleIn(userId, TENANT_A))?.role).toBe('student')
    expect((await statusOf(inv.id)).status).toBe('pending')
  })

  test('(a3) the right token from the invited account grants the ADMIN role', async () => {
    const address = email('a3')
    const userId = await makeUser(address)
    const inv = await makeInvite({ tenant: TENANT_A, address, role: 'admin' })

    const { status, body } = await join(address, TENANT_A, inv.token)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.role).toBe('admin')
    expect(await roleIn(userId, TENANT_A)).toMatchObject({ role: 'admin', status: 'active' })
    expect((await statusOf(inv.id)).status).toBe('accepted')
  })

  test('(b) a wrong token only yields a student and does not spend the invitation', async () => {
    const address = email('b')
    const userId = await makeUser(address)
    const inv = await makeInvite({ tenant: TENANT_A, address })

    const { body } = await join(address, TENANT_A, randomToken())
    expect(body.role).toBe('student')
    expect((await roleIn(userId, TENANT_A))?.role).toBe('student')
    expect((await statusOf(inv.id)).status).toBe('pending')
  })

  test('(c) the right token from the invited account grants the invited role', async () => {
    const address = email('c')
    const userId = await makeUser(address)
    const inv = await makeInvite({ tenant: TENANT_A, address, role: 'teacher' })

    const { status, body } = await join(address, TENANT_A, inv.token)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.role).toBe('teacher')
    expect(await roleIn(userId, TENANT_A)).toMatchObject({ role: 'teacher', status: 'active' })
    const after = await statusOf(inv.id)
    expect(after.status).toBe('accepted')
    expect(after.accepted_at).toBeTruthy()
  })

  test('(d) the right token from a DIFFERENT account is not consumed', async () => {
    const invitee = email('d-invitee')
    const forwarded = email('d-forwarded')
    const userId = await makeUser(forwarded)
    const inv = await makeInvite({ tenant: TENANT_A, address: invitee })

    const { body } = await join(forwarded, TENANT_A, inv.token)
    expect(body.role).toBe('student')
    expect((await roleIn(userId, TENANT_A))?.role).toBe('student')
    expect((await statusOf(inv.id)).status).toBe('pending')
  })

  test('(e) a spent token cannot be used again', async () => {
    const address = email('e')
    const userId = await makeUser(address)
    const inv = await makeInvite({ tenant: TENANT_A, address, role: 'teacher' })

    expect((await join(address, TENANT_A, inv.token)).body.role).toBe('teacher')
    // The same person is removed (row gone) and tries the same link again.
    await admin.from('tenant_users').delete().eq('user_id', userId).eq('tenant_id', TENANT_A)

    const again = await join(address, TENANT_A, inv.token)
    expect(again.body.role).toBe('student')
    expect((await roleIn(userId, TENANT_A))?.role).toBe('student')
  })

  test('(e2) two simultaneous joins with one token: exactly one claim', async () => {
    const address = email('e2')
    await makeUser(address)
    const inv = await makeInvite({ tenant: TENANT_A, address, role: 'teacher' })

    const [x, y] = await Promise.all([join(address, TENANT_A, inv.token), join(address, TENANT_A, inv.token)])
    // One request joins (teacher); the other lost the race (already a member / switched).
    const roles = [x, y].map((r) => r.body.role).filter(Boolean)
    expect(roles.every((r) => r === 'teacher')).toBe(true)
    expect((await statusOf(inv.id)).status).toBe('accepted')
  })

  test('(f) an expired invitation is not consumable', async () => {
    const address = email('f')
    const userId = await makeUser(address)
    const inv = await makeInvite({
      tenant: TENANT_A,
      address,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    const { body } = await join(address, TENANT_A, inv.token)
    expect(body.role).toBe('student')
    expect((await roleIn(userId, TENANT_A))?.role).toBe('student')
    expect((await statusOf(inv.id)).status).toBe('pending')
  })

  test("(g) tenant A's token does not work for tenant B", async () => {
    const address = email('g')
    const userId = await makeUser(address)
    const inv = await makeInvite({ tenant: TENANT_A, address, role: 'teacher' })

    const { body } = await join(address, TENANT_B, inv.token)
    expect(body.role).toBe('student')
    expect((await roleIn(userId, TENANT_B))?.role).toBe('student')
    expect(await roleIn(userId, TENANT_A)).toBeNull()
    expect((await statusOf(inv.id)).status).toBe('pending')
  })

  test('(h) tokens are unreadable to students, other tenants and anon', async () => {
    const inv = await makeInvite({ tenant: TENANT_A, address: email('h') })

    const student = createSupabaseClient(url(), anonKey(), { auth: { persistSession: false } })
    await student.auth.signInWithPassword(ACCOUNTS.student)
    const asStudent = await student.from('tenant_invitations').select('token').eq('id', inv.id)
    expect(asStudent.data ?? []).toEqual([])

    const otherAdmin = createSupabaseClient(url(), anonKey(), { auth: { persistSession: false } })
    await otherAdmin.auth.signInWithPassword(ACCOUNTS.admin) // admin of tenant B only
    const asOtherAdmin = await otherAdmin.from('tenant_invitations').select('token').eq('id', inv.id)
    expect(asOtherAdmin.data ?? []).toEqual([])

    const anon = createSupabaseClient(url(), anonKey(), { auth: { persistSession: false } })
    const asAnon = await anon.from('tenant_invitations').select('token').eq('id', inv.id)
    expect(asAnon.data ?? []).toEqual([])
  })

  test('a malformed inviteToken is rejected at the door', async () => {
    const address = email('bad')
    await makeUser(address)
    const { status, body } = await join(address, TENANT_A, 'not-a-token')
    expect(status).toBe(400)
    expect(body.code).toBe('invalid_body')
  })
})
