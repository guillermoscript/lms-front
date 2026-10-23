import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconArrowRight } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import type { Delta } from '@/lib/admin/dashboard-metrics'
import { DeltaText } from './delta-text'
import { RevenueTrend } from './revenue-trend'
import { WidgetError } from './widget-error'

export interface MetricRow {
  key: 'newStudents' | 'members' | 'courses' | 'activeSubscriptions'
  /** null when the query failed: rendered as an em dash, never as 0. */
  value: number | null
  detail?: string
  delta?: Delta
  href: string
  testId: string
}

export interface RevenueSummary {
  /** null = the transactions query failed. */
  current: number | null
  previous: number
  delta: Delta
  series: { day: string; revenue: number }[]
  /** The row cap was hit, so the window may be missing sales. */
  truncated: boolean
  rowCap: number
  /** Successful sales ever (head count); a quiet month is not an empty school. */
  lifetimeSales: number
}

export async function Performance({
  locale,
  revenue,
  metrics,
  hasConfiguredPayments,
  hasPublishedCourse,
}: {
  locale: string
  revenue: RevenueSummary
  metrics: MetricRow[]
  hasConfiguredPayments: boolean
  hasPublishedCourse: boolean
}) {
  const t = await getTranslations('dashboard.admin.main.performance')
  const money = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(n)
  const dayLabel = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const chartData = revenue.series.map((p) => ({
    label: dayLabel.format(new Date(`${p.day}T00:00:00Z`)),
    revenue: p.revenue,
  }))

  // Empty state only for a school that has NEVER sold: a quiet month shows a flat chart.
  const hasRevenue = revenue.current !== null && (revenue.lifetimeSales > 0 || revenue.current > 0 || revenue.previous > 0)
  const failed = metrics.some((m) => m.value === null)

  return (
    <section
      aria-labelledby="performance-title"
      data-tour="admin-stats"
      data-testid="admin-stats-grid"
      className="grid gap-6 lg:grid-cols-5"
    >
      <div className="space-y-3 lg:col-span-3">
        <h2 id="performance-title" className="text-sm font-semibold text-muted-foreground">
          {t('title')}
        </h2>
        {revenue.current === null ? (
          <WidgetError message={t('error')} />
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground">{t('revenue')}</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums" data-testid="admin-stat-revenue">
                {money(revenue.current)}
              </p>
              {!revenue.truncated && <DeltaText delta={revenue.delta} />}
            </div>
            {revenue.truncated && (
              <p role="status" className="text-xs text-warning">
                {t('partial', { count: revenue.rowCap })}
              </p>
            )}
            {hasRevenue ? (
              <RevenueTrend data={chartData} locale={locale} ariaLabel={t('chartLabel')} />
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
                <p className="text-sm">
                  {!hasConfiguredPayments
                    ? t('empty.connect')
                    : !hasPublishedCourse
                      ? t('empty.publish')
                      : t('empty.share')}
                </p>
                {!hasConfiguredPayments && (
                  <Button
                    size="sm"
                    render={<Link href="/dashboard/admin/settings?tab=payment" />}
                    className="gap-1.5"
                  >
                    {t('empty.connectAction')}
                    <IconArrowRight aria-hidden />
                  </Button>
                )}
                {hasConfiguredPayments && !hasPublishedCourse && (
                  <Button size="sm" variant="outline" render={<Link href="/dashboard/admin/courses" />}>
                    {t('empty.publishAction')}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-2 lg:col-span-2">
        {failed && <WidgetError message={t('statsError')} />}
        <ul className="divide-y rounded-lg border">
          {metrics.map((m) => (
            <li key={m.key}>
              <Link
                href={m.href}
                className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block text-sm">{t(m.key)}</span>
                  {m.detail && <span className="block text-xs text-muted-foreground">{m.detail}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-semibold tabular-nums" data-testid={m.testId}>
                    {m.value ?? '—'}
                  </span>
                  {m.delta && <DeltaText delta={m.delta} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
