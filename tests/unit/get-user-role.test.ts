/**
 * getUserRole must never hand out a role from another school's JWT claim.
 *
 * `custom_access_token_hook` stamps `tenant_role` for the user's HOME school
 * (`app_metadata.tenant_id`), and proxy.ts skips its membership check on public
 * routes. Before #763 an admin of school A with no membership in school B
 * POSTing a server action to b.<domain> fell through to that claim and got
 * `admin` in B — and every admin action writing through the service role
 * (theme, settings, …) trusted it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CURRENT_TENANT = 'tenant-b'
const OTHER_TENANT = 'tenant-a'

const state: {
  userId: string | null
  membership: { role: string } | null
  claims: Record<string, unknown> | null
  sessionRead: number
} = { userId: 'user-1', membership: null, claims: null, sessionRead: 0 }

function token(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims))}.signature`
}

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  // No per-request memo between test cases.
  cache: <T,>(fn: T) => fn,
}))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(CURRENT_TENANT),
  getCurrentUserId: () => Promise.resolve(state.userId),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const filters: Record<string, unknown> = {}
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value
        return query
      },
      single: async () => ({
        data:
          state.membership && filters.tenant_id === CURRENT_TENANT && filters.status === 'active'
            ? state.membership
            : null,
      }),
    }
    return {
      from: () => query,
      auth: {
        getSession: async () => {
          state.sessionRead++
          return { data: { session: state.claims ? { access_token: token(state.claims) } : null } }
        },
      },
    }
  },
}))

import { getUserRole } from '@/lib/supabase/get-user-role'

beforeEach(() => {
  state.userId = 'user-1'
  state.membership = null
  state.claims = null
  state.sessionRead = 0
})

describe('getUserRole', () => {
  it('returns null without a user', async () => {
    state.userId = null
    expect(await getUserRole()).toBeNull()
  })

  it('an active membership in the current tenant is authoritative', async () => {
    state.membership = { role: 'teacher' }
    state.claims = { tenant_id: CURRENT_TENANT, tenant_role: 'admin' }
    expect(await getUserRole()).toBe('teacher')
    expect(state.sessionRead).toBe(0)
  })

  it("falls back to the JWT role when the token's tenant is the current tenant", async () => {
    state.claims = { tenant_id: CURRENT_TENANT, tenant_role: 'admin' }
    expect(await getUserRole()).toBe('admin')
  })

  it("never grants another school's claimed role on this tenant", async () => {
    state.claims = { tenant_id: OTHER_TENANT, tenant_role: 'admin', user_role: 'admin' }
    expect(await getUserRole()).toBe('student')
  })

  it('a token without a tenant claim gets no elevated role', async () => {
    state.claims = { user_role: 'admin' }
    expect(await getUserRole()).toBe('student')
  })

  it('no session is a student', async () => {
    expect(await getUserRole()).toBe('student')
  })
})
