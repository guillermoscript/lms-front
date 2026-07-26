'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'

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

    // Guard: prevent demoting the last admin in the tenant
    const wasAdmin = await (async () => {
      const { data } = await adminClient
        .from('tenant_users')
        .select('role')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .single()
      return data?.role === 'admin'
    })()

    if (wasAdmin && !roles.includes('admin')) {
      const { count: adminCount } = await adminClient
        .from('tenant_users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .eq('status', 'active')

      if ((adminCount ?? 0) <= 1) {
        throw new Error('Cannot remove the last admin. Promote another user to admin first.')
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
 * Remove a user from the current school (issue #550).
 *
 * The cutoff email tells an over-limit school to remove members, and
 * `countTenantUsage` counts `tenant_users` rows with `role = 'student'` and
 * `status = 'active'` — but until now nothing in the app could change that.
 * `deactivateUser` below only stamps `profiles.deactivated_at`, a column read
 * nowhere except the admin users screens, so a "deactivated" student still
 * counted against the plan limit and still held their membership. This is the
 * action that actually reduces usage, and therefore the one that can lift a
 * cutoff.
 *
 * The row is kept with `status = 'removed'` rather than deleted: it preserves
 * `joined_at` history, keeps the FK-owned rows (gamification profile, roles)
 * from cascading away, and lets `joinCurrentSchool` reinstate the member
 * through the same student-limit pre-check a first-time join runs.
 */
export async function removeTenantMember(userId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()

    if (!userId) {
      throw new Error('User ID is required')
    }

    const adminClient = createAdminClient()

    // Tenant-scoped by construction: an admin of school A can only ever read
    // and write the membership row that pairs the target with school A. No
    // super-admin bypass here — removal is a per-school action, and a super
    // admin acting on a school does so through that school's context.
    const { data: membership } = await adminClient
      .from('tenant_users')
      .select('role, status')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!membership) {
      throw new Error('User not found or access denied')
    }

    if (membership.status !== 'active') {
      // Already removed — idempotent, and reconciling anyway is free.
      await reconcileAccessCutoffSafely(adminClient, tenantId)
      return { success: true }
    }

    // Same guard as `updateUserRoles`: a school with no admin left can neither
    // manage billing nor undo this, and the cutoff banner would have nobody to
    // warn.
    if (membership.role === 'admin') {
      const { count: adminCount } = await adminClient
        .from('tenant_users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .eq('status', 'active')

      if ((adminCount ?? 0) <= 1) {
        throw new Error('Cannot remove the last admin. Promote another user to admin first.')
      }
    }

    const { error: updateError } = await adminClient
      .from('tenant_users')
      .update({ status: 'removed' })
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)

    if (updateError) throw updateError

    await adminClient.from('notifications').insert({
      user_id: userId,
      notification_type: 'account_update',
      message: 'Your membership of this school has been removed by an administrator.',
      link: '/join-school',
    })

    // The whole point of the removal, from billing's side: usage just dropped,
    // so a cutoff scheduled against the student limit may now be liftable.
    await reconcileAccessCutoffSafely(adminClient, tenantId)

    revalidatePath('/dashboard/admin/users')
    revalidatePath(`/dashboard/admin/users/${userId}`)
    revalidatePath('/dashboard/admin/billing')

    return { success: true }
  } catch (error) {
    console.error('Remove tenant member failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove member',
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
