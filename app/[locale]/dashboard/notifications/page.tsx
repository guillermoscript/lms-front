import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { NotificationsClient } from "@/components/notifications-client"
import { getTranslations } from "next-intl/server"

export default async function NotificationsPage() {
  const t = await getTranslations('dashboard.student.notifications')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch user notifications
  const { data: notifications } = await supabase
    .from("user_notifications")
    .select(
      `
      *,
      notification:notifications(*)
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('description')}
        </p>
      </div>

      <NotificationsClient notifications={notifications || []} />
    </div>
  )
}
