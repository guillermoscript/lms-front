import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { formatByCurrency, sumByCurrency } from '@/lib/payments/format-money'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PayoutsTable } from '@/components/admin/payouts-table'
import {
  IconCurrencyDollar,
  IconClock,
  IconAlertCircle,
} from '@tabler/icons-react'

export default async function AdminPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.payouts')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  // Verify admin role for this tenant
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!membership || membership.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <IconAlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold">{t('accessDenied')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('accessDeniedDesc')}</p>
        </div>
      </div>
    )
  }

  // Fetch payouts for this tenant. Paged and count-verified (#548): the
  // summary below sums this list, so a read truncated at the API row cap would
  // understate the school's own "Total paid" without any error to notice.
  // `created_at` is not unique, so `payout_id` breaks ties — an unstable sort
  // makes `.range()` windows overlap or skip.
  const rows = await fetchAllRows('payouts', (from, to) =>
    supabase
      .from('payouts')
      .select(
        'payout_id, amount, currency, status, period_start, period_end, stripe_payout_id, paid_at, failure_reason, created_at, note, payout_method',
        { count: 'exact' }
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('payout_id', { ascending: false })
      .range(from, to)
  )

  // Summary calculations. Paid payouts are totalled per currency and rendered as
  // one figure each — a school selling in USD and EUR reads two figures, not
  // their sum in dollars (#531, same invariant #497 fixed on the platform page).
  const totalPaidByCurrency = sumByCurrency(rows.filter((p) => p.status === 'paid'))

  const pendingCount = rows.filter((p) => p.status === 'pending' || p.status === 'processing').length

  return (
    <div className="min-h-screen bg-background" data-testid="payouts-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: t('title') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        {/* Summary cards */}
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t('stats.totalPaid')}
                  </p>
                  <p
                    className="mt-2 text-2xl font-bold tracking-tight tabular-nums break-words"
                    data-testid="total-paid-value"
                  >
                    {formatByCurrency(totalPaidByCurrency, locale)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('stats.totalPaidDesc')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
                  <IconCurrencyDollar className="h-[18px] w-[18px] text-brand-text" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t('stats.pendingCount')}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                    {pendingCount}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('stats.pendingCountDesc')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <IconClock className="h-[18px] w-[18px] text-warning" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payouts table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('table.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <PayoutsTable
              locale={locale}
              rows={rows.map((p) => ({
                id: p.payout_id,
                periodStart: p.period_start,
                periodEnd: p.period_end,
                amount: Number(p.amount ?? 0),
                currency: p.currency,
                status: p.status || '',
                failureReason: p.failure_reason,
                method: p.payout_method === 'manual' ? 'manual' : 'stripeConnect',
                note: p.note,
                paidAt: p.paid_at,
                stripePayoutId: p.stripe_payout_id,
              }))}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
