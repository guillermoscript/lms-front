'use server'

import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'

/**
 * Pin a post to the top of the feed
 */
export async function pinPost(postId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    // Verify post belongs to this tenant
    const { data: post, error: fetchError } = await adminClient
      .from('community_posts')
      .select('id, tenant_id')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: 'Post not found' }
    }

    if (post.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await adminClient
      .from('community_posts')
      .update({ is_pinned: true, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to pin post:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to pin post',
    }
  }
}

/**
 * Unpin a post
 */
export async function unpinPost(postId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: post, error: fetchError } = await adminClient
      .from('community_posts')
      .select('id, tenant_id')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: 'Post not found' }
    }

    if (post.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await adminClient
      .from('community_posts')
      .update({ is_pinned: false, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to unpin post:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unpin post',
    }
  }
}

/**
 * Lock a post to prevent new comments
 */
export async function lockPost(postId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: post, error: fetchError } = await adminClient
      .from('community_posts')
      .select('id, tenant_id')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: 'Post not found' }
    }

    if (post.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await adminClient
      .from('community_posts')
      .update({ is_locked: true, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to lock post:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to lock post',
    }
  }
}

/**
 * Unlock a post to allow new comments
 */
export async function unlockPost(postId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: post, error: fetchError } = await adminClient
      .from('community_posts')
      .select('id, tenant_id')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: 'Post not found' }
    }

    if (post.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await adminClient
      .from('community_posts')
      .update({ is_locked: false, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to unlock post:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unlock post',
    }
  }
}

/**
 * Hide a post (admin moderation)
 */
export async function hidePost(postId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: post, error: fetchError } = await adminClient
      .from('community_posts')
      .select('id, tenant_id')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: 'Post not found' }
    }

    if (post.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await adminClient
      .from('community_posts')
      .update({ is_hidden: true, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to hide post:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to hide post',
    }
  }
}

/**
 * Hide a comment (admin moderation)
 */
export async function hideComment(commentId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { data: comment, error: fetchError } = await adminClient
      .from('community_comments')
      .select('id, tenant_id')
      .eq('id', commentId)
      .single()

    if (fetchError || !comment) {
      return { success: false, error: 'Comment not found' }
    }

    if (comment.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    const { error } = await adminClient
      .from('community_comments')
      .update({ is_hidden: true, updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to hide comment:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to hide comment',
    }
  }
}

/**
 * Mute a user (prevent them from posting/commenting)
 */
export async function muteUser(
  userId: string,
  reason?: string,
  mutedUntil?: string
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    // Get admin user for muted_by field
    const adminUserId = await getCurrentUserId()
    if (!adminUserId) {
      return { success: false, error: 'Not authenticated' }
    }

    // Cannot mute yourself
    if (userId === adminUserId) {
      return { success: false, error: 'You cannot mute yourself' }
    }

    // Validate muted_until is in the future if provided
    if (mutedUntil && new Date(mutedUntil) <= new Date()) {
      return { success: false, error: 'Mute expiration must be in the future' }
    }

    // Verify user belongs to this tenant
    const { data: tenantUser } = await adminClient
      .from('tenant_users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .single()

    if (!tenantUser) {
      return { success: false, error: 'User not found in this school' }
    }

    // Upsert mute record (in case user was previously muted)
    const { error } = await adminClient
      .from('community_user_mutes')
      .upsert(
        {
          tenant_id: tenantId,
          user_id: userId,
          muted_by: adminUserId,
          reason: reason || null,
          muted_until: mutedUntil || null,
        },
        { onConflict: 'tenant_id,user_id' }
      )

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    return { success: true }
  } catch (err) {
    console.error('Failed to mute user:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to mute user',
    }
  }
}

/**
 * Unmute a user
 */
export async function unmuteUser(userId: string): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from('community_user_mutes')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    return { success: true }
  } catch (err) {
    console.error('Failed to unmute user:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unmute user',
    }
  }
}

/**
 * Review a flagged content report
 */
export async function reviewFlag(
  flagId: string,
  status: 'reviewed' | 'dismissed'
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    // Verify flag belongs to this tenant
    const { data: flag, error: fetchError } = await adminClient
      .from('community_flags')
      .select('id, tenant_id')
      .eq('id', flagId)
      .single()

    if (fetchError || !flag) {
      return { success: false, error: 'Flag not found' }
    }

    if (flag.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    // Get the admin user ID for reviewed_by
    const reviewerUserId = await getCurrentUserId()
    if (!reviewerUserId) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await adminClient
      .from('community_flags')
      .update({
        status,
        reviewed_by: reviewerUserId,
      })
      .eq('id', flagId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    return { success: true }
  } catch (err) {
    console.error('Failed to review flag:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to review flag',
    }
  }
}

/**
 * Update community-related tenant settings
 */
export async function updateCommunitySettings(settings: {
  community_student_posts_school_feed?: boolean
  community_student_polls?: boolean
  community_milestone_posts?: boolean
}): Promise<ActionResult> {
  try {
    await verifyAdminAccess()
    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()

    const rows = Object.entries(settings).map(([key, value]) => ({
      tenant_id: tenantId,
      setting_key: key,
      setting_value: { enabled: value },
    }))

    if (rows.length === 0) {
      return { success: false, error: 'No settings provided' }
    }

    const { error } = await adminClient
      .from('tenant_settings')
      .upsert(rows, { onConflict: 'tenant_id,setting_key' })

    if (error) throw error

    revalidatePath('/dashboard/admin/community')
    revalidatePath('/dashboard/admin/settings')
    return { success: true }
  } catch (err) {
    console.error('Failed to update community settings:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update community settings',
    }
  }
}
