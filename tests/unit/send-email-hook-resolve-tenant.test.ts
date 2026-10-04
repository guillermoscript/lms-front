import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `resolveTenantIdForAuthEmail` (issue #776) decides which school a branded
 * Auth email is rendered as. Priority: the subdomain in `redirect_to` (the
 * tenant the visitor was actually on), then their `preferred_tenant_id`
 * membership, then their oldest active membership, then `null` — never a
 * guess the caller can't justify.
 */

type TenantRow = { id: string; status: string }
type MembershipRow = { tenant_id: string; status: string }

const state: {
  tenantsBySlug: Map<string, TenantRow>
  membershipsByUser: Map<string, MembershipRow[]>
} = { tenantsBySlug: new Map(), membershipsByUser: new Map() }

function makeFakeAdmin() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select() {
          return builder
        },
        eq(column: string, value: unknown) {
          filters[column] = value
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        maybeSingle: async () => {
          if (table === 'tenants') {
            const row = state.tenantsBySlug.get(filters.slug as string)
            if (!row) return { data: null, error: null }
            if (filters.status && row.status !== filters.status) return { data: null, error: null }
            return { data: { id: row.id }, error: null }
          }
          if (table === 'tenant_users') {
            const rows = state.membershipsByUser.get(filters.user_id as string) ?? []
            const match = rows.find(
              (r) =>
                (filters.tenant_id === undefined || r.tenant_id === filters.tenant_id) &&
                (filters.status === undefined || r.status === filters.status)
            )
            return { data: match ? { tenant_id: match.tenant_id } : null, error: null }
          }
          throw new Error(`send-email-hook-resolve-tenant.test: unexpected table ${table}`)
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeFakeAdmin() }))

import { tenantSlugFromUrl, resolveTenantIdForAuthEmail } from '@/lib/auth/send-email-hook/resolve-tenant'

beforeEach(() => {
  state.tenantsBySlug.clear()
  state.membershipsByUser.clear()
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN = 'lvh.me:3005'
})

describe('tenantSlugFromUrl', () => {
  it('extracts the slug from a tenant subdomain', () => {
    expect(tenantSlugFromUrl('https://acme.lvh.me:3005/auth/confirm')).toBe('acme')
  })

  it('returns null for the platform apex domain', () => {
    expect(tenantSlugFromUrl('https://lvh.me:3005/auth/confirm')).toBeNull()
  })

  it('returns null for localhost', () => {
    expect(tenantSlugFromUrl('http://localhost:3005/auth/confirm')).toBeNull()
  })

  it('returns null for a malformed URL', () => {
    expect(tenantSlugFromUrl('not-a-url')).toBeNull()
  })

  it('returns null for a missing URL', () => {
    expect(tenantSlugFromUrl(null)).toBeNull()
  })
})

describe('resolveTenantIdForAuthEmail', () => {
  it('resolves from the redirect_to subdomain when the tenant is active', async () => {
    state.tenantsBySlug.set('acme', { id: 'tenant-acme', status: 'active' })

    const result = await resolveTenantIdForAuthEmail({
      redirectTo: 'https://acme.lvh.me:3005/auth/confirm?next=/dashboard/student',
      userId: 'user-1',
      userMetadata: null,
    })

    expect(result).toBe('tenant-acme')
  })

  it('ignores an inactive tenant behind the subdomain and falls through', async () => {
    state.tenantsBySlug.set('gone', { id: 'tenant-gone', status: 'inactive' })
    state.membershipsByUser.set('user-1', [{ tenant_id: 'tenant-home', status: 'active' }])

    const result = await resolveTenantIdForAuthEmail({
      redirectTo: 'https://gone.lvh.me:3005/auth/confirm',
      userId: 'user-1',
      userMetadata: null,
    })

    expect(result).toBe('tenant-home')
  })

  it('falls back to preferred_tenant_id metadata when it is still an active membership', async () => {
    state.membershipsByUser.set('user-1', [
      { tenant_id: 'tenant-old', status: 'active' },
      { tenant_id: 'tenant-preferred', status: 'active' },
    ])

    const result = await resolveTenantIdForAuthEmail({
      redirectTo: null,
      userId: 'user-1',
      userMetadata: { preferred_tenant_id: 'tenant-preferred' },
    })

    expect(result).toBe('tenant-preferred')
  })

  it('ignores preferred_tenant_id when that membership is not active, and falls to the oldest membership', async () => {
    state.membershipsByUser.set('user-1', [{ tenant_id: 'tenant-oldest', status: 'active' }])

    const result = await resolveTenantIdForAuthEmail({
      redirectTo: null,
      userId: 'user-1',
      userMetadata: { preferred_tenant_id: 'tenant-inactive' },
    })

    expect(result).toBe('tenant-oldest')
  })

  it('returns null when nothing resolves — caller falls back to the platform palette', async () => {
    const result = await resolveTenantIdForAuthEmail({
      redirectTo: 'https://lvh.me:3005/auth/sign-up',
      userId: 'user-1',
      userMetadata: null,
    })

    expect(result).toBeNull()
  })
})
