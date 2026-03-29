import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

/**
 * Get the user's role for the current tenant.
 * First checks tenant_users table (authoritative for multi-tenant),
 * then falls back to JWT claims.
 *
 * Uses x-user-id header (set by middleware) to avoid redundant getUser() calls.
 */
export async function getUserRole(): Promise<'student' | 'teacher' | 'admin' | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  // Check tenant_users for the current tenant (authoritative source)
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (membership?.role) {
    return membership.role as 'student' | 'teacher' | 'admin'
  }

  // Fall back to JWT claims
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return 'student'

    const payload = JSON.parse(atob(session.access_token.split('.')[1]))
    const role = (payload.tenant_role || payload.user_role) as 'student' | 'teacher' | 'admin' | undefined
    return role || 'student'
  } catch {
    return 'student'
  }
}

/**
 * Get user role from JWT claims (used in middleware)
 */
export function getRoleFromClaims(claims: any): 'student' | 'teacher' | 'admin' {
  const role = (claims?.tenant_role || claims?.user_role) as 'student' | 'teacher' | 'admin' | undefined
  return role || 'student'
}

/**
 * Get tenant ID from JWT claims
 */
export async function getUserTenantId(): Promise<string | null> {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return null

  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]))
    return payload.tenant_id || null
  } catch {
    return null
  }
}

/**
 * Check if current user is a super admin by querying the super_admins table directly.
 * Does NOT trust JWT claims to prevent privilege escalation.
 *
 * Uses x-user-id header (set by middleware) to avoid redundant getUser() calls.
 */
export async function isSuperAdmin(): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false

  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('super_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return !!data
}
