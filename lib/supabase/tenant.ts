import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export interface Tenant {
  id: string
  slug: string
  name: string
  domain: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  plan: string
  status: string
}

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Get tenant from subdomain. Used in middleware.
 * Does NOT require auth — uses anon key.
 */
export async function getTenantFromSubdomain(slug: string): Promise<Tenant | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()
  return data
}

/**
 * Get the current tenant from request headers (set by middleware).
 * For use in server components.
 */
export async function getCurrentTenant(): Promise<Tenant | null> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')

  if (!tenantId) {
    // Fallback to default tenant
    return getDefaultTenant()
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .eq('status', 'active')
    .single()
  return data
}

/**
 * Get the current tenant ID from headers. Quick accessor.
 */
export async function getCurrentTenantId(): Promise<string> {
  const headersList = await headers()
  return headersList.get('x-tenant-id') || DEFAULT_TENANT_ID
}

/**
 * Get the current user ID from headers (set by middleware after getUser() validation).
 * Returns null for unauthenticated requests.
 * Use this instead of supabase.auth.getUser() in server components to avoid
 * redundant network calls to Supabase Auth (prevents rate limiting).
 */
export async function getCurrentUserId(): Promise<string | null> {
  const headersList = await headers()
  return headersList.get('x-user-id') || null
}

/**
 * Get the current user from the session cookie (NO network call).
 * Safe to use in server components because the middleware already validated
 * the token via getUser(). Returns the user object with email, metadata, etc.
 * Use this instead of supabase.auth.getUser() when you need user properties
 * beyond just the ID (email, user_metadata, created_at).
 */
export async function getSessionUser() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

/**
 * Get the default tenant (for single-tenant backward compat).
 */
export async function getDefaultTenant(): Promise<Tenant | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', DEFAULT_TENANT_ID)
    .single()
  return data
}

/**
 * Get all tenants a user belongs to.
 */
export async function getUserTenants(userId: string): Promise<Array<Tenant & { role: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenant_users')
    .select(`
      role,
      tenant:tenants (*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!data) return []

  return data.map((tu: any) => ({
    ...tu.tenant,
    role: tu.role,
  }))
}
