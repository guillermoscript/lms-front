import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { IconAlertTriangle } from '@tabler/icons-react'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { WebhooksManager } from '@/components/webhooks/webhooks-manager'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { listEndpoints, listRecentDeliveries } from '@/lib/webhooks/endpoints'
import { SCHOOL_WEBHOOK_EVENTS } from '@/lib/webhooks/events'

/** School owner view: this school's webhook endpoints and delivery log. */
export default async function SchoolWebhooksPage() {
  if ((await getUserRole()) !== 'admin') redirect('/dashboard/admin')

  const [t, tBreadcrumbs, tenantId] = await Promise.all([
    getTranslations('webhooks'),
    getTranslations('dashboard.admin.breadcrumbs'),
    getCurrentTenantId(),
  ])

  let data: Awaited<ReturnType<typeof load>> | null = null
  try {
    data = await load(tenantId)
  } catch (err) {
    console.error('[webhooks] school page read failed:', err instanceof Error ? err.message : err)
  }

  return (
    <div className="min-h-screen bg-background" data-testid="webhooks-page">
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('settings'), href: '/dashboard/admin/settings' },
                { label: t('breadcrumb') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{t('description.school')}</p>
        </div>
      </header>
      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        {data ? (
          <WebhooksManager scope="school" endpoints={data.endpoints} deliveries={data.deliveries} events={SCHOOL_WEBHOOK_EVENTS} />
        ) : (
          <Alert variant="destructive">
            <IconAlertTriangle aria-hidden />
            <AlertTitle>{t('loadError')}</AlertTitle>
            <AlertDescription>{t('loadErrorDesc')}</AlertDescription>
          </Alert>
        )}
      </main>
    </div>
  )
}

async function load(tenantId: string) {
  const admin = createAdminClient()
  const endpoints = await listEndpoints(admin, tenantId)
  const deliveries = await listRecentDeliveries(admin, tenantId, endpoints)
  return { endpoints, deliveries }
}
