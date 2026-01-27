import { createClient } from '@/lib/supabase/server'

/**
 * Get the user's role from their JWT claims
 * The role is injected by the custom_access_token_hook function in the database
 */
export async function getUserRole(): Promise<'student' | 'teacher' | 'admin' | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Get the role from app_metadata which is set by the custom_access_token_hook
  const role = user.app_metadata?.user_role as 'student' | 'teacher' | 'admin' | undefined

  return role || 'student' // Default to student if no role is set
}

/**
 * Get user role from JWT claims (used in middleware)
 */
export function getRoleFromClaims(claims: any): 'student' | 'teacher' | 'admin' {
  const role = claims?.user_role as 'student' | 'teacher' | 'admin' | undefined
  return role || 'student'
}
