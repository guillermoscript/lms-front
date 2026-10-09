import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * #929 `GET /api/billing/fees/statements/[statementNumber]`: an active admin
 * of the owning school, or a super admin, reads the frozen statement; anyone
 * else gets the same 404 as a missing number (never confirms one exists), and
 * the ledger behind the live status is only loaded after authorization.
 */

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

const state = {
  user: { id: 'u1' } as { id: string } | null,
  role: 'admin' as string | null,
  superAdmin: false,
  ownerTenant: TENANT as string | null,
  loads: 0,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: state.user }, error: null }) },
      from: () => {
        const b = {
          select: () => b,
          eq: () => b,
          maybeSingle: () => Promise.resolve({ data: state.role ? { role: state.role } : null, error: null }),
        }
        return b
      },
    }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: state.ownerTenant ? { tenant_id: state.ownerTenant } : null, error: null }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve(TENANT) }))
vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: () => Promise.resolve(state.superAdmin) }))
vi.mock('@/lib/billing/platform-fee-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-fee-statement')>()
  return {
    ...actual,
    loadFeeStatement: () => {
      state.loads++
      return Promise.resolve({ statementNumber: 'PF-202609-1', tenantId: state.ownerTenant, nonFiscal: true })
    },
  }
})

import { GET } from '@/app/api/billing/fees/statements/[statementNumber]/route'

const call = (n = 'PF-202609-1') => GET({} as NextRequest, { params: Promise.resolve({ statementNumber: n }) })

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'admin'
  state.superAdmin = false
  state.ownerTenant = TENANT
  state.loads = 0
})

describe('GET /api/billing/fees/statements/[statementNumber]', () => {
  it('serves the owning school admin', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).statement).toMatchObject({ statementNumber: 'PF-202609-1', nonFiscal: true })
  })

  it('401s anonymous', async () => {
    state.user = null
    expect((await call()).status).toBe(401)
  })

  it('404s (not 403) another school, a non-admin member and a malformed number — without loading the ledger', async () => {
    state.ownerTenant = OTHER
    expect((await call()).status).toBe(404)
    state.ownerTenant = TENANT
    state.role = 'student'
    expect((await call()).status).toBe(404)
    expect((await call('INV-1')).status).toBe(404)
    expect(state.loads).toBe(0)
  })

  it('a super admin reads any school', async () => {
    state.superAdmin = true
    state.ownerTenant = OTHER
    state.role = null
    expect((await call()).status).toBe(200)
  })
})
