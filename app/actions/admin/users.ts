'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { normalizeBanReason } from '@/lib/tenant/ban'

/**
 * Drop this school's `tenant_id` stamp from a user who just left it (removed
 * or banned). Their JWT carries this school's `tenant_id`/role claim until it
 * expires and `custom_access_token_hook` re-mints it from `app_metadata` on
 * every refresh, so without this a removed member kept the claim forever.
 * RLS on the community also checks `tenant_users` now (#896), but other
 * claim-trusting policies do not. Best-effort: the removal itself already holds
 * on every app path via `tenant_users`.
 */
async function clearTenantClaim(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  tenantId: string,
  label: string
): Promise<void> {
  try {
    const { data: authUser } = await adminClient.auth.admin.getUserById(userId)
    if (authUser?.user?.app_metadata?.tenant_id === tenantId) {
      await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { tenant_id: null },
      })
    }
  } catch (claimErr) {
    console.error(`${label}: failed to clear tenant claim:`, claimErr)
  }
}

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

    await clearTenantClaim(adminClient, userId, tenantId, 'Remove')

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
 * Ban a user from the current school (#892).
 *
 * A removal can be undone by the member themselves (they re-join through the
 * join link); a ban cannot — every join path refuses a `banned` row and the
 * `guard_tenant_ban` trigger backs that up at the database. The admin lifts it
 * with `liftTenantBan`, which puts the person back to "removed", not "active".
 *
 * Tenant-scoped by construction (no super-admin bypass, same as
 * `removeTenantMember`): the RPC is keyed by the current tenant id and the
 * caller was verified as an admin of it by `verifyAdminAccess()`. The RPC
 * itself refuses banning yourself or the last active admin.
 */
export async function banTenantMember(
  userId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const actorId = await getCurrentUserId()

    if (!userId) throw new Error('User ID is required')
    if (!actorId) throw new Error('Not authenticated')

    const adminClient = createAdminClient()

    const { error } = await adminClient.rpc('ban_tenant_member', {
      _tenant_id: tenantId,
      _user_id: userId,
      _actor_id: actorId,
      _reason: normalizeBanReason(reason) ?? undefined,
    })

    if (error) {
      const message = error.message ?? ''
      if (message.includes('cannot_ban_self')) throw new Error('You cannot ban yourself.')
      if (message.includes('last_admin')) {
        throw new Error('Cannot ban the last admin. Promote another user to admin first.')
      }
      if (message.includes('member_not_found')) throw new Error('User not found or access denied')
      throw error
    }

    await clearTenantClaim(adminClient, userId, tenantId, 'Ban')

    await adminClient.from('notifications').insert({
      user_id: userId,
      notification_type: 'account_update',
      message: 'You have been removed from this school and can no longer rejoin it.',
      link: '/join-school',
    })

    // Usage dropped exactly as for a removal — see `removeTenantMember`.
    await reconcileAccessCutoffSafely(adminClient, tenantId)

    revalidatePath('/dashboard/admin/users')
    revalidatePath(`/dashboard/admin/users/${userId}`)
    revalidatePath('/dashboard/admin/billing')

    return { success: true }
  } catch (error) {
    console.error('Ban tenant member failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to ban member',
    }
  }
}

/**
 * Lift a ban (#892). The member lands on `removed`: they are not reinstated,
 * they may re-join through the join link like any removed member — through the
 * student-limit check, so lifting a ban never spends a seat by itself.
 */
export async function liftTenantBan(userId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()

    if (!userId) throw new Error('User ID is required')

    const adminClient = createAdminClient()

    // Ownership: the pair (tenant, user) must be a banned row of THIS school.
    const { data: membership } = await adminClient
      .from('tenant_users')
      .select('status')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!membership) throw new Error('User not found or access denied')

    if (membership.status === 'banned') {
      const { error } = await adminClient.rpc('lift_tenant_ban', {
        _tenant_id: tenantId,
        _user_id: userId,
      })
      if (error) throw error

      await adminClient.from('notifications').insert({
        user_id: userId,
        notification_type: 'account_update',
        message: 'The ban on your membership of this school was lifted. You can rejoin it.',
        link: '/join-school',
      })
    }

    revalidatePath('/dashboard/admin/users')
    revalidatePath(`/dashboard/admin/users/${userId}`)

    return { success: true }
  } catch (error) {
    console.error('Lift tenant ban failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to lift ban',
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
