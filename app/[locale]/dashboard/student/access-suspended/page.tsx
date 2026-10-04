import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconLock, IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { track } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

/**
 * Where a student lands when their school's access cutoff (issue #494) has
 * passed. They own the course — nothing is wrong with their purchase — so
 * bouncing them to the dashboard or a 404 would be a lie. This page names the
 * real cause and points at the person who can fix it.
 */
export default async function AccessSuspendedPage() {
  const [t, locale] = await Promise.all([
    getTranslations('dashboard.student.accessSuspended'),
    getLocale(),
  ])

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, access_cutoff_at')
    .eq('id', tenantId)
    .single()

  // Cutoff cleared while the student sat on this page (school upgraded, or
  // usage dropped back under the limit) — don't strand them here.
  const cutoffAt = tenant?.access_cutoff_at
  if (!cutoffAt || new Date(cutoffAt) > new Date()) {
    redirect('/dashboard/student')
  }

  // One event, high value: a student who reaches this screen is mid-churn
  // through no fault of their own — their school lapsed. Placed after the
  // redirect guard so a cleared cutoff does not count, and before the render
  // because the page has no client component to hang it on.
  await track(
    ANALYTICS_EVENTS.ACCESS_SUSPENDED_SHOWN,
    { reason: 'tenant_access_cutoff', cutoff_at: cutoffAt },
    { userId, tenantId, locale, role: 'student' }
  )

  return (
    <div className="container mx-auto flex max-w-2xl flex-col items-center gap-8 px-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <IconLock className="size-8" aria-hidden="true" />
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {t('title')}
        </h1>
        <p className="text-muted-foreground text-pretty">
          {t('description', { school: tenant?.name ?? '' })}
        </p>
      </div>

      <Card className="w-full text-left">
        <CardContent className="space-y-2 py-6">
          <p className="text-sm font-medium">{t('whatNowTitle')}</p>
          <p className="text-muted-foreground text-sm text-pretty">{t('whatNowBody')}</p>
          <p className="text-muted-foreground text-sm">
            {t('since', {
              // Explicit locale — `undefined` on the server resolves to the
              // Node process locale, not the request's (#517).
              date: new Date(cutoffAt).toLocaleDateString(locale, { dateStyle: 'long' }),
            })}
          </p>
        </CardContent>
      </Card>

      <Link href="/dashboard/student">
        <Button variant="outline">
          <IconArrowLeft className="size-4" aria-hidden="true" />
          {t('backToDashboard')}
        </Button>
      </Link>
    </div>
  )
}
