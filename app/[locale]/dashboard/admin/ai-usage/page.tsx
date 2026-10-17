import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'

import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isAiFeature } from '@/lib/ai/features'
import { getAiUsageReport, isRangeDays, USAGE_RANGES, type AiUsageReport } from '@/lib/ai/usage-report'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

function usd(locale: string, v: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: v > 0 && v < 0.1 ? 4 : 2,
  }).format(v)
}

export default async function AiUsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ days?: string }>
}) {
  const role = await getUserRole()
  if (role !== 'admin') redirect('/dashboard/admin')

  const [{ locale }, { days: daysParam }, t, tAi, tBreadcrumbs, tenantId] = await Promise.all([
    params,
    searchParams,
    getTranslations('aiUsage'),
    getTranslations('aiSettings'),
    getTranslations('dashboard.admin.breadcrumbs'),
    getCurrentTenantId(),
  ])
  const requested = Number(daysParam)
  const days = isRangeDays(requested) ? requested : 30

  let report: AiUsageReport | null = null
  try {
    report = await getAiUsageReport(tenantId, days)
  } catch (e) {
    console.error('[ai-usage] report failed', e instanceof Error ? e.name : typeof e)
  }

  const featureName = (id: string) => (isAiFeature(id) ? tAi(`features.${id}.name`) : id)
  const money = (v: number) => usd(locale, v)
  const nf = new Intl.NumberFormat(locale)

  const header = (
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <nav aria-label={t('title')} className="flex gap-1 rounded-lg border p-1 text-sm">
            {USAGE_RANGES.map((d) => (
              <Link
                key={d}
                href={`/dashboard/admin/ai-usage?days=${d}`}
                aria-current={d === days ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 ${d === days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {t(`range.${d}`)}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )

  if (!report) {
    return (
      <div className="min-h-screen bg-background" data-testid="ai-usage-page">
        {header}
        <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
          <Alert variant="destructive">
            <IconAlertTriangle aria-hidden />
            <AlertTitle>{t('loadError')}</AlertTitle>
          </Alert>
        </main>
      </div>
    )
  }

  const { totals, byFeature, byUser, daily } = report
  const activeUsers = byUser.filter((u) => u.userId).length
  const tokens = totals.inputTokens + totals.outputTokens
  const maxDayTokens = Math.max(1, ...daily.map((d) => d.tokens))

  if (totals.calls === 0) {
    return (
      <div className="min-h-screen bg-background" data-testid="ai-usage-page">
        {header}
        <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle>{t('empty.title')}</CardTitle>
              <CardDescription>{t('empty.description')}</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background" data-testid="ai-usage-page">
      {header}
      <main className="mx-auto container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('cards.cost')} value={money(totals.costUsd)} hint={totals.hasUnpriced ? '+' : undefined} />
          <Stat label={t('cards.calls')} value={nf.format(totals.calls)} />
          <Stat label={t('cards.tokens')} value={nf.format(tokens)} />
          <Stat
            label={t('cards.avgPerUser')}
            value={activeUsers ? money(totals.costUsd / activeUsers) : '—'}
            hint={t('cards.activeUsers', { count: activeUsers })}
          />
        </div>

        <Alert>
          <IconInfoCircle aria-hidden />
          <AlertDescription>
            {t('estimateNote')} {totals.hasUnpriced && t('unpriced')}
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>{t('daily.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1" role="list">
              {daily.map((d) => (
                <div
                  key={d.day}
                  role="listitem"
                  title={`${d.day} · ${t('daily.tokensLabel', { tokens: nf.format(d.tokens), calls: nf.format(d.calls) })} · ${money(d.costUsd)}`}
                  className="min-w-1 flex-1 rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, (d.tokens / maxDayTokens) * 100)}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('byUser.title')}</CardTitle>
            <CardDescription>{t('byUser.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('byUser.user')}</TableHead>
                  <TableHead className="text-right">{t('byUser.calls')}</TableHead>
                  <TableHead className="text-right">{t('byUser.tokens')}</TableHead>
                  <TableHead className="text-right">{t('byUser.cost')}</TableHead>
                  <TableHead className="text-right">{t('byUser.share')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byUser.slice(0, 100).map((u) => (
                  <TableRow key={u.userId ?? 'unknown'}>
                    <TableCell className="font-medium">
                      {u.userId ? (
                        <Link href={`/dashboard/admin/users/${u.userId}`} className="hover:underline">
                          {u.fullName || u.userId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t('byUser.unknown')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(u.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(u.inputTokens + u.outputTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(u.costUsd)}
                      {u.hasUnpriced && '+'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {totals.costUsd > 0 ? `${Math.round((u.costUsd / totals.costUsd) * 100)}%` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('byFeature.title')}</CardTitle>
            <CardDescription>{t('byFeature.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('byFeature.feature')}</TableHead>
                  <TableHead className="text-right">{t('byFeature.calls')}</TableHead>
                  <TableHead className="text-right">{t('byFeature.tokens')}</TableHead>
                  <TableHead className="text-right">{t('byFeature.cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byFeature.map((f) => (
                  <TableRow key={f.feature}>
                    <TableCell className="font-medium">{featureName(f.feature)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(f.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(f.inputTokens + f.outputTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(f.costUsd)}
                      {f.hasUnpriced && '+'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
