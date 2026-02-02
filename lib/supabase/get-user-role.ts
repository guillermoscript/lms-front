import { createClient } from '@/lib/supabase/server'

/**
 * Get the user's role from their JWT claims
 * The role is injected by the custom_access_token_hook function in the database
 */
export async function getUserRole(): Promise<'student' | 'teacher' | 'admin' | null> {
  const supabase = await createClient()

  // Get the session to access JWT claims
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return null
  }

  // Decode the JWT to get custom claims set by custom_access_token_hook
  // The access_token is a JWT that contains our custom claims
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]))
    const role = payload.user_role as 'student' | 'teacher' | 'admin' | undefined
    return role || 'student'
  } catch {
    return 'student'
  }
}

/**
 * Get user role from JWT claims (used in middleware)
 */
export function getRoleFromClaims(claims: any): 'student' | 'teacher' | 'admin' {
  const role = claims?.user_role as 'student' | 'teacher' | 'admin' | undefined
  return role || 'student'
}
