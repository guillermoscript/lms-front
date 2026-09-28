import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { NotificationsClient } from "@/components/notifications-client"
import type { NotificationRow } from "@/components/notifications/notification-item"
import { getTranslations } from "next-intl/server"
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'

export default async function NotificationsPage() {
  const t = await getTranslations('dashboard.student.notifications')
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) {
    redirect("/auth/login")
  }
  const [tenantId, role] = await Promise.all([getCurrentTenantId(), getUserRole()])

  // This school's notifications only (#870). The embed is `!inner` and filtered
  // by tenant: a member of several schools used to get every school's rows,
  // with `notification` null for the ones RLS hid — and the list crashed on
  // `.title`. Dismissed rows are gone for good, so they are not read at all.
  const [list, prefs] = await Promise.all([
    supabase
      .from("user_notifications")
      .select(
        `
        id,
        in_app_read,
        created_at,
        notification:notifications!inner(id, title, content, notification_type, priority, metadata, tenant_id)
      `
      )
      .eq("user_id", userId)
      .eq("notification.tenant_id", tenantId)
      .not("dismissed", "is", true)
      .order("created_at", { ascending: false })
      .limit(50),
    // Global per user; no row = the defaults (both on).
    supabase
      .from("notification_preferences")
      .select("community_replies, community_prompts")
      .eq("user_id", userId)
      .maybeSingle(),
  ])

  if (list.error) console.error('notifications page: list read failed', list.error)
  if (prefs.error) console.error('notifications page: preferences read failed', prefs.error)

  return (
    <div className="container max-w-4xl p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('description')}
        </p>
      </div>

      <NotificationsClient
        notifications={(list.data ?? []) as unknown as NotificationRow[]}
        loadError={Boolean(list.error)}
        role={role}
        preferences={{
          replies: prefs.data?.community_replies !== false,
          prompts: prefs.data?.community_prompts !== false,
        }}
      />
    </div>
  )
}
