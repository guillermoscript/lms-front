'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'

type NotificationType = 'announcement' | 'alert' | 'info' | 'success' | 'warning' | 'error'
type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'
type TargetType = 'all' | 'role' | 'course' | 'user' | 'custom'
type NotificationStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled'

interface NotificationData {
  title: string
  content: string
  notification_type: NotificationType
  priority?: NotificationPriority
  target_type: TargetType
  target_roles?: string[]
  target_course_id?: number
  target_user_ids?: string[]
  delivery_channels?: string[]
  scheduled_for?: string | null
  expires_at?: string | null
  template_id?: number | null
  metadata?: Record<string, unknown>
}

interface ActionResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** A broadcast as the admin list renders it (components/admin/notifications-list.tsx). */
export interface AdminNotificationRow {
  id: number
  title: string
  content: string
  notification_type: string
  priority: string
  status: string
  target_type: string
  sent_at: string | null
  scheduled_for: string | null
  created_at: string
  created_by_user?: { full_name: string; email: string }
  course?: { title: string }
}

export interface AdminNotificationStats {
  total: number
  sent: number
  scheduled: number
  draft: number
  recent: Array<{ id: number; title: string; status: string; created_at: string }>
}

/**
 * Create a new notification
 */
export async function createNotification(data: NotificationData): Promise<ActionResponse<{ id: number }>> {
  try {
    const role = await getUserRole()
    const tenantId = await getCurrentTenantId()
    const supabase = await createClient()
    const userId = await getCurrentUserId()
    if (!userId) {
      return { success: false, error: 'Not authenticated' }
    }

    // Verify permissions
    if (role !== 'admin' && role !== 'teacher') {
      return { success: false, error: 'Unauthorized' }
    }

    // Teachers can only create course notifications for their own courses
    if (role === 'teacher') {
      if (data.target_type !== 'course' || !data.target_course_id) {
        return { success: false, error: 'Teachers can only create course notifications' }
      }

      // Verify teacher owns the course (tenant-scoped)
      const { data: course } = await supabase
        .from('courses')
        .select('author_id')
        .eq('course_id', data.target_course_id)
        .eq('tenant_id', tenantId)
        .single()

      if (!course || course.author_id !== userId) {
        return { success: false, error: 'You can only create notifications for your own courses' }
      }
    }

    const adminClient = createAdminClient()

    // Create notification
    const { data: notification, error } = await adminClient
      .from('notifications')
      .insert({
        ...data,
        created_by: userId,
        status: data.scheduled_for ? 'scheduled' : 'draft',
        tenant_id: tenantId
      })
      .select()
      .single()

    if (error) throw error

    // If sending immediately and status should be 'sent', dispatch to users
    if (!data.scheduled_for) {
      await dispatchNotification(notification.id)
    }

    revalidatePath('/dashboard/admin/notifications')
    return { success: true, data: notification }
  } catch (error) {
    console.error('Error creating notification:', error)
    return { success: false, error: 'Failed to create notification' }
  }
}

/**
 * Dispatch notification to target users (create user_notifications records)
 */
export async function dispatchNotification(
  notificationId: number
): Promise<ActionResponse<{ usersNotified: number }>> {
  try {
    const role = await getUserRole()
    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const adminClient = createAdminClient()

    // Get notification details and verify tenant ownership
    const { data: notification, error: notifError } = await adminClient
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .single()

    if (notifError || !notification) {
      throw new Error('Notification not found')
    }

    // Verify notification belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && notification.tenant_id !== tenantId) {
      throw new Error('Notification not found or access denied')
    }

    // Community rows (#870) are fanned out by the database, once.
    if (notification.notification_type === 'community') {
      throw new Error('Community notifications cannot be dispatched')
    }

    // Get target users based on target_type
    let userIds: string[] = []

    // Use notification.tenant_id (from DB) to scope all user lookups
    const notifTenantId = notification.tenant_id

    if (notification.target_type === 'all') {
      // Only target users in THIS tenant, not all platform users
      const { data: users } = await adminClient
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', notifTenantId)
        .eq('status', 'active')
      userIds = users?.map(u => u.user_id) || []
    } else if (notification.target_type === 'role' && notification.target_roles) {
      // Only target users with matching role in THIS tenant
      const { data: users } = await adminClient
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', notifTenantId)
        .eq('status', 'active')
        .in('role', notification.target_roles)
      userIds = users?.map(u => u.user_id) || []
    } else if (notification.target_type === 'course' && notification.target_course_id) {
      const { data: enrollments } = await adminClient
        .from('enrollments')
        .select('user_id')
        .eq('tenant_id', notifTenantId)
        .eq('course_id', notification.target_course_id)
        .eq('status', 'active')
      userIds = enrollments?.map(e => e.user_id) || []
    } else if (notification.target_type === 'user' && notification.target_user_ids) {
      userIds = notification.target_user_ids
    }

    // Create user_notification records
    if (userIds.length > 0) {
      const userNotifications = userIds.map(userId => ({
        notification_id: notificationId,
        user_id: userId,
      }))

      const { error: insertError } = await adminClient
        .from('user_notifications')
        .insert(userNotifications)

      if (insertError) throw insertError
    }

    // Update notification status to 'sent'
    await adminClient
      .from('notifications')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('tenant_id', tenantId)

    revalidatePath('/dashboard/admin/notifications')
    return { success: true, data: { usersNotified: userIds.length } }
  } catch (error) {
    console.error('Error dispatching notification:', error)
    return { success: false, error: 'Failed to dispatch notification' }
  }
}

/**
 * Get all notifications (admin view)
 */
export async function getNotifications(
  status?: NotificationStatus,
  limit = 50
): Promise<ActionResponse<AdminNotificationRow[]>> {
  try {
    const role = await getUserRole()
    if (role !== 'admin' && role !== 'teacher') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    // Broadcasts only. Community rows (#870) are per-recipient system
    // notifications: they would flood this list, and must not be dispatched or
    // edited from it (RLS refuses the edit anyway).
    let query = supabase
      .from('notifications')
      .select(`
        *,
        created_by_user:profiles!notifications_created_by_profile_fkey(full_name),
        course:courses(title)
      `)
      .eq('tenant_id', tenantId)
      .neq('notification_type', 'community')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error

    return { success: true, data }
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return { success: false, error: 'Failed to fetch notifications' }
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  userNotificationId: number
): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const userId = await getCurrentUserId()
    if (!userId) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('user_notifications')
      .update({
        in_app_read: true,
        in_app_read_at: new Date().toISOString(),
      })
      .eq('id', userNotificationId)
      .eq('user_id', userId)

    if (error) throw error

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return { success: false, error: 'Failed to mark as read' }
  }
}

/** Rows marked read per round trip by `markAllNotificationsAsRead`. */
const MARK_ALL_BATCH = 200
/** Runaway guard: 50 × 200 = 10,000 unread notifications. */
const MARK_ALL_MAX_BATCHES = 50

/**
 * Mark all of the current user's notifications IN THIS SCHOOL as read.
 *
 * It used to flip every unread row the user had, across every school they
 * belong to, from whichever school they pressed the button in. The page and
 * the bell only show this school's rows (#870), so that is all this touches.
 * Each round reads the next batch of unread ids (bounded, #548) and marks
 * them; a marked row drops out of the next read, so the loop ends on an empty
 * batch.
 */
export async function markAllNotificationsAsRead(): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const userId = await getCurrentUserId()
    if (!userId) {
      return { success: false, error: 'Not authenticated' }
    }
    const tenantId = await getCurrentTenantId()

    let previousFirstId: number | null = null
    for (let batch = 0; batch < MARK_ALL_MAX_BATCHES; batch++) {
      const { data: unread, error: readError } = await supabase
        .from('user_notifications')
        .select('id, notification:notifications!inner(tenant_id)')
        .eq('user_id', userId)
        .eq('in_app_read', false)
        .not('dismissed', 'is', true)
        .eq('notification.tenant_id', tenantId)
        .order('id')
        .limit(MARK_ALL_BATCH)

      if (readError) throw readError
      const ids = (unread ?? []).map((row) => row.id as number)
      // Empty: done. Same first row as last time: the update did not take, and
      // looping again would not change that.
      if (ids.length === 0 || ids[0] === previousFirstId) break
      previousFirstId = ids[0]

      const { error } = await supabase
        .from('user_notifications')
        .update({
          in_app_read: true,
          in_app_read_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .in('id', ids)

      if (error) throw error
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    return { success: false, error: 'Failed to mark all as read' }
  }
}

/**
 * Dismiss notification
 */
export async function dismissNotification(
  userNotificationId: number
): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const userId = await getCurrentUserId()
    if (!userId) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('user_notifications')
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
      })
      .eq('id', userNotificationId)
      .eq('user_id', userId)

    if (error) throw error

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error) {
    console.error('Error dismissing notification:', error)
    return { success: false, error: 'Failed to dismiss notification' }
  }
}

/**
 * Update notification status
 */
export async function updateNotificationStatus(
  notificationId: number,
  status: NotificationStatus
): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const adminClient = createAdminClient()

    // Verify notification belongs to tenant (unless super_admin), and is a
    // broadcast — community rows (#870) are system-written.
    const { data: notification, error: verifyError } = await adminClient
      .from('notifications')
      .select('tenant_id, notification_type')
      .eq('id', notificationId)
      .single()

    if (
      verifyError ||
      !notification ||
      (!isSuperAdminUser && notification.tenant_id !== tenantId) ||
      notification.notification_type === 'community'
    ) {
      return { success: false, error: 'Notification not found or access denied' }
    }

    const { error } = await adminClient
      .from('notifications')
      .update({ status })
      .eq('id', notificationId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/notifications')
    return { success: true }
  } catch (error) {
    console.error('Error updating notification status:', error)
    return { success: false, error: 'Failed to update status' }
  }
}

/**
 * Delete notification
 */
export async function deleteNotification(notificationId: number): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const adminClient = createAdminClient()

    // Verify notification belongs to tenant (unless super_admin)
    if (!isSuperAdminUser) {
      const { data: notification, error: verifyError } = await adminClient
        .from('notifications')
        .select('tenant_id')
        .eq('id', notificationId)
        .single()

      if (verifyError || !notification || notification.tenant_id !== tenantId) {
        return { success: false, error: 'Notification not found or access denied' }
      }
    }

    const { error } = await adminClient
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/notifications')
    return { success: true }
  } catch (error) {
    console.error('Error deleting notification:', error)
    return { success: false, error: 'Failed to delete notification' }
  }
}

/**
 * Get notification statistics — of the broadcasts; community rows (#870) are
 * system notifications and are not counted.
 */
export async function getNotificationStats(): Promise<ActionResponse<AdminNotificationStats>> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const adminClient = createAdminClient()
    const tenantId = await getCurrentTenantId()

    const [
      { count: totalNotifications },
      { count: sentNotifications },
      { count: scheduledNotifications },
      { count: draftNotifications },
      { data: recentNotifications },
    ] = await Promise.all([
      adminClient.from('notifications').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).neq('notification_type', 'community'),
      adminClient.from('notifications').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).neq('notification_type', 'community').eq('status', 'sent'),
      adminClient.from('notifications').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).neq('notification_type', 'community').eq('status', 'scheduled'),
      adminClient.from('notifications').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).neq('notification_type', 'community').eq('status', 'draft'),
      adminClient
        .from('notifications')
        .select('id, title, status, created_at')
        .eq('tenant_id', tenantId)
        .neq('notification_type', 'community')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    return {
      success: true,
      data: {
        total: totalNotifications || 0,
        sent: sentNotifications || 0,
        scheduled: scheduledNotifications || 0,
        draft: draftNotifications || 0,
        recent: recentNotifications || [],
      },
    }
  } catch (error) {
    console.error('Error fetching notification stats:', error)
    return { success: false, error: 'Failed to fetch stats' }
  }
}
