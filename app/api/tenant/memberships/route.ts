/**
 * The caller's schools — `GET /api/tenant/memberships` (#845).
 *
 * Feeds the native app's school switcher. Reads with the service role,
 * filtered by the verified user id, so it answers the same for a token with no
 * `tenant_id` claim (a member of nothing, or of several) as for any other.
 * Active memberships only: a school you were removed from is not one you can
 * switch back into (join it again instead).
 *
 * `activeTenantId` is `app_metadata.tenant_id` — what the next refreshed JWT
 * will carry, which `POST /api/tenant/switch` sets.
 */
import { getApiUser } from '@/lib/supabase/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getApiUser(req)
  if (!user) return Response.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { data, error } = await createAdminClient()
    .from('tenant_users')
    .select('tenant_id, role, joined_at, tenants!inner(slug, name, status)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('tenants.status', 'active')
    .order('joined_at', { ascending: true })

  if (error) {
    console.error('Failed to list memberships:', error)
    return Response.json({ error: 'Failed to list schools' }, { status: 500 })
  }

  const memberships = (data ?? []).map((row) => {
    // Generated types model this to-one embed as an array; PostgREST returns
    // a bare object. Accept both.
    const t = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants
    return { tenantId: row.tenant_id, slug: t?.slug ?? null, name: t?.name ?? null, role: row.role }
  })

  const activeTenantId = (user.app_metadata?.tenant_id as string | undefined) ?? null
  return Response.json({ memberships, activeTenantId })
}
