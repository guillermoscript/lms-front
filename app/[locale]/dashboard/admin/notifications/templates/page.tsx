import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getNotificationTemplates } from '@/app/actions/admin/notification-templates'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { IconArrowLeft, IconTemplate } from '@tabler/icons-react'
import { CreateTemplateButton } from '@/components/admin/create-template-button'
import { TemplatesClient } from '@/components/admin/templates-client'

export default async function NotificationTemplatesPage() {
  const t = await getTranslations('dashboard.admin.notifications.templates')
  // Verify admin role
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin/notifications')
  }

  // Fetch templates
  const result = await getNotificationTemplates()
  const templates = result.success ? result.data : []

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/admin/notifications">
            <Button variant="outline" size="sm">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              {t('back')}
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <IconTemplate className="h-8 w-8" />
              {t('title')}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('description')}
            </p>
          </div>
        </div>
        <CreateTemplateButton />
      </div>

      {/* Templates List */}
      <TemplatesClient templates={templates || []} />
    </div>
  )
}
