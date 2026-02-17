'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'

/**
 * Updates user roles. Replaces all existing roles with the provided ones.
 */
export async function updateUserRoles(
  userId: string,
  roles: ('admin' | 'teacher' | 'student')[]
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!userId) {
      throw new Error('User ID is required')
    }

    if (!Array.isArray(roles)) {
      throw new Error('Roles must be an array')
    }

    const adminClient = createAdminClient()

    // Verify user belongs to current tenant (unless super_admin)
    if (!isSuperAdminUser) {
      const { data: tenantUser, error: verifyError } = await adminClient
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .single()

      if (verifyError || !tenantUser) {
        throw new Error('User not found or access denied')
      }
    }

    // Delete existing roles
    const { error: deleteError } = await adminClient
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)

    if (deleteError) throw deleteError

    // Insert new roles
    if (roles.length > 0) {
      const { error: insertError } = await adminClient
        .from('user_roles')
        .insert(
          roles.map(role => ({
            user_id: userId,
            role: role,
            tenant_id: tenantId
          }))
        )

      if (insertError) throw insertError
    }

    // Create notification for user
    await adminClient.from('notifications').insert({
      user_id: userId,
      notification_type: 'account_update',
      message: 'Your account roles have been updated by an administrator.',
      link: '/dashboard'
    })

    revalidatePath('/dashboard/admin/users')
    revalidatePath(`/dashboard/admin/users/${userId}`)

    return { success: true }
  } catch (error) {
    console.error('Update user roles failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user roles'
    }
  }
}

/**
 * Deactivates a user account
 */
export async function deactivateUser(
  userId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!userId) {
      throw new Error('User ID is required')
    }

    const adminClient = createAdminClient()

    // Verify user belongs to current tenant (unless super_admin)
    if (!isSuperAdminUser) {
      const { data: tenantUser, error: verifyError } = await adminClient
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .single()

      if (verifyError || !tenantUser) {
        throw new Error('User not found or access denied')
      }
    }

    // Update profile to mark as deactivated
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ deactivated_at: new Date().toISOString() })
      .eq('id', userId)

    if (updateError) throw updateError

    // Create notification for user
    await adminClient.from('notifications').insert({
      user_id: userId,
      notification_type: 'account_update',
      message: reason
        ? `Your account has been deactivated: ${reason}`
        : 'Your account has been deactivated by an administrator.',
      link: '/dashboard'
    })

    revalidatePath('/dashboard/admin/users')
    revalidatePath(`/dashboard/admin/users/${userId}`)

    return { success: true }
  } catch (error) {
    console.error('Deactivate user failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to deactivate user'
    }
  }
}

/**
 * Reactivates a deactivated user account
 */
export async function reactivateUser(userId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!userId) {
      throw new Error('User ID is required')
    }

    const adminClient = createAdminClient()

    // Verify user belongs to current tenant (unless super_admin)
    if (!isSuperAdminUser) {
      const { data: tenantUser, error: verifyError } = await adminClient
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .single()

      if (verifyError || !tenantUser) {
        throw new Error('User not found or access denied')
      }
    }

    // Update profile to remove deactivation
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ deactivated_at: null })
      .eq('id', userId)

    if (updateError) throw updateError

    // Create notification for user
    await adminClient.from('notifications').insert({
      user_id: userId,
      notification_type: 'account_update',
      message: 'Your account has been reactivated. You can now access the platform.',
      link: '/dashboard'
    })

    revalidatePath('/dashboard/admin/users')
    revalidatePath(`/dashboard/admin/users/${userId}`)

    return { success: true }
  } catch (error) {
    console.error('Reactivate user failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reactivate user'
    }
  }
}
