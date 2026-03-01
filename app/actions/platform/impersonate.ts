'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { cookies } from 'next/headers'

/**
 * Impersonate a user within a tenant via Supabase magic link.
 * Returns the magic link URL the super admin should be redirected to.
 */
export async function impersonateUser(targetUserId: string, tenantId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!(await isSuperAdmin())) throw new Error('Super admin only')

  const adminClient = createAdminClient()

  // Get target user email
  const { data: targetUser, error: userError } = await adminClient.auth.admin.getUserById(targetUserId)
  if (userError || !targetUser.user?.email) throw new Error('Target user not found')

  // Generate magic link
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetUser.user.email,
  })

  if (error || !data.properties?.hashed_token) {
    throw new Error('Failed to generate magic link')
  }

  // Audit log
  await adminClient.from('impersonation_log').insert({
    super_admin_id: user.id,
    target_user_id: targetUserId,
    tenant_id: tenantId,
  })

  // Build the confirm URL so it goes through Supabase auth callback
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${data.properties.hashed_token}&type=magiclink&redirect_to=/en/dashboard`

  return { url: confirmUrl }
}

/**
 * List users within a tenant for impersonation selection.
 */
export async function getTenantUsersForImpersonation(tenantId: string) {
  if (!(await isSuperAdmin())) throw new Error('Super admin only')

  const adminClient = createAdminClient()

  const { data: members, error } = await adminClient
    .from('tenant_users')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('role')
    .limit(50)

  if (!members || members.length === 0) return []

  // Fetch profiles and auth emails in parallel
  const userIds = members.map(m => m.user_id)
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  const profileMap = (profiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p.full_name }), {} as Record<string, string>)

  const withEmails = await Promise.all(
    members.map(async (m) => {
      const { data } = await adminClient.auth.admin.getUserById(m.user_id)
      return {
        user_id: m.user_id,
        role: m.role,
        full_name: profileMap[m.user_id] || 'Unknown',
        email: data.user?.email || '',
      }
    })
  )

  return withEmails
}
