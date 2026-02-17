import { createClient } from '@/lib/supabase/server'

/**
 * Get the user's role from their JWT claims
 * The role is injected by the custom_access_token_hook function in the database
 */
export async function getUserRole(): Promise<'student' | 'teacher' | 'admin' | null> {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return null
  }

  try {
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
 * Check if current user is a super admin from JWT claims
 */
export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return false

  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]))
    return payload.is_super_admin === true
  } catch {
    return false
  }
}
