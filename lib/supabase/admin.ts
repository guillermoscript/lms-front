import { createClient } from '@supabase/supabase-js'
import { getUserRole } from './get-user-role'

/**
 * Creates a Supabase client with service role permissions.
 * WARNING: This bypasses Row Level Security. Only use after verifying admin access.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * Verifies that the current user has admin role.
 * Throws an error if the user is not an admin.
 */
export async function verifyAdminAccess() {
  const role = await getUserRole()
  if (role !== 'admin') {
    throw new Error('Unauthorized: Admin access required')
  }
  return true
}

/**
 * Type for server action results
 */
export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }
