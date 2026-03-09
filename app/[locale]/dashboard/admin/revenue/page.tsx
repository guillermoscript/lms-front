import { getRevenueOverview } from '@/app/actions/admin/revenue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import {
  IconCurrencyDollar,
  IconReceipt,
  IconTrendingUp,
} from '@tabler/icons-react'

export default async function RevenuePage() {
  const t = await getTranslations('dashboard.admin.revenue')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const revenue = await getRevenueOverview()

  return (
    <div className="min-h-screen bg-background" data-testid="revenue-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: tBreadcrumbs('revenue') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {revenue.transactionCount === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <IconCurrencyDollar className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('empty')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t('totalRevenue')}
                      </p>
                      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                        {formatCurrency(revenue.totalRevenue, revenue.currency)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {t('transactionCount', { count: revenue.transactionCount })}
                      </p>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                      <IconCurrencyDollar className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t('platformFees')}
                      </p>
                      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-muted-foreground">
                        {formatCurrency(revenue.platformFees, revenue.currency)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {t('upgradeToReduce')}
                      </p>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                      <IconReceipt className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t('netRevenue')}
                      </p>
                      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(revenue.netRevenue, revenue.currency)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {t('afterFees')}
                      </p>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                      <IconTrendingUp className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue by Product */}
            {revenue.revenueByCourse.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('revenueByProduct')}</CardTitle>
                  <CardDescription>{t('topEarning')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {revenue.revenueByCourse.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(item.amount, revenue.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Monthly Trend */}
            {revenue.monthlyTrend.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('monthlyTrend')}</CardTitle>
                  <CardDescription>{t('monthlyTrendDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {revenue.monthlyTrend.map((item) => {
                      const maxAmount = Math.max(...revenue.monthlyTrend.map(t => t.amount))
                      const width = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0
                      return (
                        <div key={item.month} className="flex items-center gap-3">
                          <span className="w-20 text-xs text-muted-foreground shrink-0 tabular-nums">
                            {item.month}
                          </span>
                          <div className="flex-1">
                            <div
                              className="h-6 rounded-md bg-primary/20 flex items-center px-2"
                              style={{ width: `${Math.max(width, 2)}%` }}
                            >
                              <span className="text-xs font-medium tabular-nums">
                                {formatCurrency(item.amount, revenue.currency)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  )
}
