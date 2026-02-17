'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
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
  metadata?: Record<string, any>
}

interface ActionResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Create a new notification
 */
export async function createNotification(data: NotificationData): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    const tenantId = await getCurrentTenantId()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
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

      // Verify teacher owns the course
      const { data: course } = await supabase
        .from('courses')
        .select('author_id')
        .eq('course_id', data.target_course_id)
        .single()

      if (!course || course.author_id !== user.id) {
        return { success: false, error: 'You can only create notifications for your own courses' }
      }
    }

    const adminClient = createAdminClient()

    // Create notification
    const { data: notification, error } = await adminClient
      .from('notifications')
      .insert({
        ...data,
        created_by: user.id,
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
export async function dispatchNotification(notificationId: number): Promise<ActionResponse> {
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

    // Get target users based on target_type
    let userIds: string[] = []

    if (notification.target_type === 'all') {
      const { data: users } = await adminClient
        .from('profiles')
        .select('id')
      userIds = users?.map(u => u.id) || []
    } else if (notification.target_type === 'role' && notification.target_roles) {
      const { data: users } = await adminClient
        .from('user_roles')
        .select('user_id, roles!inner(role_name)')
        .in('roles.role_name', notification.target_roles)
      userIds = users?.map(u => u.user_id) || []
    } else if (notification.target_type === 'course' && notification.target_course_id) {
      const { data: enrollments } = await adminClient
        .from('enrollments')
        .select('user_id')
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
): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin' && role !== 'teacher') {
      return { success: false, error: 'Unauthorized' }
    }

    const supabase = await createClient()

    let query = supabase
      .from('notifications')
      .select(`
        *,
        created_by_user:profiles!notifications_created_by_fkey(full_name, email),
        course:courses(title)
      `)
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
 * Get user's notifications (for notification bell)
 */
export async function getUserNotifications(
  unreadOnly = false,
  limit = 20
): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    let query = supabase
      .from('user_notifications')
      .select(`
        *,
        notification:notifications(*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('in_app_read', false)
    }

    const { data, error } = await query

    if (error) throw error

    return { success: true, data }
  } catch (error) {
    console.error('Error fetching user notifications:', error)
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
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('user_notifications')
      .update({
        in_app_read: true,
        in_app_read_at: new Date().toISOString(),
      })
      .eq('id', userNotificationId)
      .eq('user_id', user.id)

    if (error) throw error

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return { success: false, error: 'Failed to mark as read' }
  }
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllNotificationsAsRead(): Promise<ActionResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('user_notifications')
      .update({
        in_app_read: true,
        in_app_read_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('in_app_read', false)

    if (error) throw error

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
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('user_notifications')
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
      })
      .eq('id', userNotificationId)
      .eq('user_id', user.id)

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
 * Get notification statistics
 */
export async function getNotificationStats(): Promise<ActionResponse> {
  try {
    const role = await getUserRole()
    if (role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const adminClient = createAdminClient()

    const [
      { count: totalNotifications },
      { count: sentNotifications },
      { count: scheduledNotifications },
      { count: draftNotifications },
      { data: recentNotifications },
    ] = await Promise.all([
      adminClient.from('notifications').select('*', { count: 'exact', head: true }),
      adminClient.from('notifications').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
      adminClient.from('notifications').select('*', { count: 'exact', head: true }).eq('status', 'scheduled'),
      adminClient.from('notifications').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
      adminClient
        .from('notifications')
        .select('id, title, status, created_at')
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
