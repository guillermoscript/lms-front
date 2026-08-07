import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getTranslations } from 'next-intl/server'
import { track } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function Page({ searchParams }: { searchParams: Promise<{ error: string }> }) {
  const t = await getTranslations('auth.error')
  const params = await searchParams

  // Tracked from the SERVER, unlike the rest of §9.2. Whoever lands here has a
  // broken magic link or an expired callback and is about to leave without
  // filing a bug; losing 10-30% of them to an adblocker is the one place that
  // loss is not acceptable. No user id — by definition there is no session.
  await track(
    ANALYTICS_EVENTS.AUTH_ERROR_SHOWN,
    { error_code: params?.error ?? 'unspecified' },
    { tenantId: await getCurrentTenantId().catch(() => null) }
  )

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{t('title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {params?.error ? (
                <p className="text-sm text-muted-foreground">{t('code', { error: params.error })}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('generic')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
