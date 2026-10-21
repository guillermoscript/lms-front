import 'server-only'

import { tenantOrigin } from '@/lib/tenant/origin'
import { createAdminClient } from '@/lib/supabase/admin'

export interface UserSchool {
  tenantId: string
  name: string
  slug: string
  role: string
  /** OAuth custom-connector URL for this school's subdomain. */
  connectorUrl: string
}

/**
 * Every school the user is an active member of, with the role they hold THERE
 * (a student in one school can be an admin in another). Admin client: names and
 * slugs must resolve regardless of the caller's current tenant claim; the
 * query is pinned to `userId`, which the caller takes from the session.
 */
export async function getUserSchools(userId: string): Promise<UserSchool[]> {
  const { data } = await createAdminClient()
    .from('tenant_users')
    .select('tenant_id, role, tenants(name, slug, domain)')
    .eq('user_id', userId)
    .eq('status', 'active')

  return (data ?? []).map((row) => {
    const tenant = row.tenants as { name?: string; slug?: string; domain?: string | null } | null
    const slug = tenant?.slug ?? ''
    return {
      tenantId: row.tenant_id as string,
      name: tenant?.name ?? '',
      slug,
      role: (row.role as string) ?? 'student',
      connectorUrl: `${tenantOrigin(tenant ? { slug, domain: tenant.domain } : null)}/api/mcp`,
    }
  })
}
