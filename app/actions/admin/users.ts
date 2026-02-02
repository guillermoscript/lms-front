'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'

/**
 * Updates user roles. Replaces all existing roles with the provided ones.
 */
export async function updateUserRoles(
  userId: string,
  roles: ('admin' | 'teacher' | 'student')[]
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    if (!userId) {
      throw new Error('User ID is required')
    }

    if (!Array.isArray(roles)) {
      throw new Error('Roles must be an array')
    }

    const adminClient = createAdminClient()

    // Delete existing roles
    const { error: deleteError } = await adminClient
      .from('user_roles')
      .delete()
      .eq('user_id', userId)

    if (deleteError) throw deleteError

    // Insert new roles
    if (roles.length > 0) {
      const { error: insertError } = await adminClient
        .from('user_roles')
        .insert(
          roles.map(role => ({
            user_id: userId,
            role: role
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

    if (!userId) {
      throw new Error('User ID is required')
    }

    const adminClient = createAdminClient()

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

    if (!userId) {
      throw new Error('User ID is required')
    }

    const adminClient = createAdminClient()

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
