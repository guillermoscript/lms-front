import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getNotifications, getNotificationStats } from '@/app/actions/admin/notifications'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  IconBell,
  IconSend,
  IconClock,
  IconFile,
  IconPlus,
  IconTemplate,
} from '@tabler/icons-react'
import NotificationsList from '@/components/admin/notifications-list'
import CreateNotificationButton from '@/components/admin/create-notification-button'

export default async function NotificationsPage() {
  const t = await getTranslations('dashboard.admin.notifications')
  // Verify admin role
  const role = await getUserRole()
  if (role !== 'admin' && role !== 'teacher') {
    redirect('/dashboard/admin')
  }

  // Fetch notifications and stats
  const [notificationsResult, statsResult] = await Promise.all([
    getNotifications(),
    role === 'admin' ? getNotificationStats() : Promise.resolve({ success: false, data: null }),
  ])

  const notifications = notificationsResult.success ? notificationsResult.data : []
  const stats = statsResult.success ? statsResult.data : null

  // Filter notifications by status
  const allNotifications = notifications || []
  const sentNotifications = allNotifications.filter((n: any) => n.status === 'sent')
  const scheduledNotifications = allNotifications.filter((n: any) => n.status === 'scheduled')
  const draftNotifications = allNotifications.filter((n: any) => n.status === 'draft')

  return (
    <div className="space-y-6 p-8" data-testid="notifications-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/admin/notifications/templates">
            <Button variant="outline">
              <IconTemplate className="mr-2 h-4 w-4" />
              {t('buttons.templates')}
            </Button>
          </Link>
          <CreateNotificationButton />
        </div>
      </div>

      {/* Statistics Cards - Admin Only */}
      {role === 'admin' && stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.total')}</p>
                  <p className="mt-2 text-3xl font-bold">{stats.total}</p>
                </div>
                <IconBell className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.sent')}</p>
                  <p className="mt-2 text-3xl font-bold">{stats.sent}</p>
                </div>
                <IconSend className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.scheduled')}</p>
                  <p className="mt-2 text-3xl font-bold">{stats.scheduled}</p>
                </div>
                <IconClock className="h-10 w-10 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.drafts')}</p>
                  <p className="mt-2 text-3xl font-bold">{stats.draft}</p>
                </div>
                <IconFile className="h-10 w-10 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notifications Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>{t('manage.title')}</CardTitle>
          <CardDescription>
            {t('manage.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">
                {t('tabs.all')} ({allNotifications.length})
              </TabsTrigger>
              <TabsTrigger value="sent">
                {t('tabs.sent')} ({sentNotifications.length})
              </TabsTrigger>
              <TabsTrigger value="scheduled">
                {t('tabs.scheduled')} ({scheduledNotifications.length})
              </TabsTrigger>
              <TabsTrigger value="draft">
                {t('tabs.drafts')} ({draftNotifications.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              <NotificationsList notifications={allNotifications} />
            </TabsContent>

            <TabsContent value="sent" className="space-y-4">
              <NotificationsList notifications={sentNotifications} />
            </TabsContent>

            <TabsContent value="scheduled" className="space-y-4">
              <NotificationsList notifications={scheduledNotifications} />
            </TabsContent>

            <TabsContent value="draft" className="space-y-4">
              <NotificationsList notifications={draftNotifications} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
