'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import { joinSchool } from '@/lib/tenant/join-school'

/**
 * Join the current tenant as a student
 */
export async function joinCurrentSchool() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const tenantId = await getCurrentTenantId()
  const outcome = await joinSchool({ admin: createAdminClient(), user, tenantId })
  if (!outcome.ok) {
    return { success: false, error: outcome.error }
  }

  // Refresh session to get updated JWT claims
  await supabase.auth.refreshSession()

  revalidatePath('/dashboard/student')
  revalidatePath('/join-school')

  return { success: true, emailSent: outcome.emailSent }
}

/**
 * Get user's school memberships
 */
export async function getUserSchoolMemberships() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, memberships: [] }
  }

  const { data: memberships } = await supabase
    .from('tenant_users')
    .select(`
      tenant_id,
      role,
      status,
      joined_at,
      tenants (
        id,
        name,
        slug,
        description
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })

  return {
    success: true,
    memberships: memberships || []
  }
}

/**
 * Switch to a different school
 */
export async function switchSchool(tenantId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify user is a member of the target tenant
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!membership) {
    return { success: false, error: 'You are not a member of this school' }
  }

  // Update preferred tenant
  await supabase.auth.updateUser({
    data: { preferred_tenant_id: tenantId }
  })

  // Refresh session
  await supabase.auth.refreshSession()

  return { success: true }
}
