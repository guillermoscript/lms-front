import { getTranslations } from 'next-intl/server'
import { WebhooksManager } from '@/components/webhooks/webhooks-manager'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { PlatformPanel } from '@/components/platform/section'
import { createAdminClient } from '@/lib/supabase/admin'
import { listEndpoints, listRecentDeliveries } from '@/lib/webhooks/endpoints'
import { PLATFORM_WEBHOOK_EVENTS } from '@/lib/webhooks/events'

/**
 * Platform webhooks: endpoints that receive EVERY school's events plus
 * platform-only school lifecycle events. Behind the /platform super-admin
 * layout guard; every write re-verifies `isSuperAdmin()` in the action.
 */
export default async function PlatformWebhooksPage() {
  const t = await getTranslations('webhooks')

  let data: { endpoints: Awaited<ReturnType<typeof listEndpoints>>; deliveries: Awaited<ReturnType<typeof listRecentDeliveries>> } | null = null
  try {
    const admin = createAdminClient()
    const endpoints = await listEndpoints(admin, null)
    data = { endpoints, deliveries: await listRecentDeliveries(admin, null, endpoints) }
  } catch (err) {
    console.error('[webhooks] platform page read failed:', err instanceof Error ? err.message : err)
  }

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-webhooks-page">
      <PlatformPageHeader title={t('title')} description={t('description.platform')} />
      {data ? (
        <WebhooksManager scope="platform" endpoints={data.endpoints} deliveries={data.deliveries} events={PLATFORM_WEBHOOK_EVENTS} />
      ) : (
        <PlatformPanel className="px-5 py-4 text-sm text-destructive" role="alert">
          {t('loadError')}
        </PlatformPanel>
      )}
    </main>
  )
}
