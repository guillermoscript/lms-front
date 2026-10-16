import type { SupabaseClient } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import { resolveTenantLocale } from '@/lib/i18n/tenant-locale'

export type MemberNoticeKind =
  | 'roleChanged'
  | 'removed'
  | 'banned'
  | 'banLifted'
  | 'deactivated'
  | 'reactivated'

const NOTICE_TYPE: Record<MemberNoticeKind, 'info' | 'success' | 'warning'> = {
  roleChanged: 'info',
  removed: 'warning',
  banned: 'warning',
  banLifted: 'success',
  deactivated: 'warning',
  reactivated: 'success',
}

/**
 * Tell one member about an admin action on their account (#961): a tenant
 * scoped `notifications` row targeted at the user plus the `user_notifications`
 * row that makes it show in the inbox and get picked up by the push sweep.
 * Text comes from the `memberNotices` catalogue in the school's language
 * (nothing stores a per-student locale).
 *
 * Never throws: a failed notice is logged and must not fail the admin action.
 * Returns whether the notice was fully written.
 */
export async function notifyMember(params: {
  admin: SupabaseClient
  tenantId: string
  userId: string
  actorId?: string | null
  kind: MemberNoticeKind
  reason?: string | null
  link?: string
}): Promise<boolean> {
  const { admin, tenantId, userId, actorId, kind, reason, link } = params
  try {
    const locale = await resolveTenantLocale(admin, tenantId)
    const t = await getTranslations({ locale, namespace: 'memberNotices' })
    const key = kind === 'deactivated' && reason ? 'deactivatedWithReason' : kind

    const { data: notification, error } = await admin
      .from('notifications')
      .insert({
        title: t(`${key}.title`),
        content: t(`${key}.content`, { reason: reason ?? '' }),
        notification_type: NOTICE_TYPE[kind],
        priority: 'normal',
        target_type: 'user',
        target_user_ids: [userId],
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: actorId ?? null,
        tenant_id: tenantId,
        metadata: link ? { link, kind } : { kind },
      })
      .select('id')
      .single()

    if (error || !notification) {
      console.error(`notifyMember(${kind}) insert failed:`, error)
      return false
    }

    const { error: linkError } = await admin
      .from('user_notifications')
      .insert({ notification_id: notification.id, user_id: userId })
    if (linkError) {
      console.error(`notifyMember(${kind}) user_notifications insert failed:`, linkError)
      return false
    }
    return true
  } catch (err) {
    console.error(`notifyMember(${kind}) failed (non-fatal):`, err)
    return false
  }
}
