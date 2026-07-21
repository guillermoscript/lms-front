import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  IconBuildingBank,
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
  const dateLocale = locale === 'es' ? es : enUS

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

  // Fetch payouts for this tenant
  const { data: payouts } = await supabase
    .from('payouts')
    .select('payout_id, amount, currency, status, period_start, period_end, stripe_payout_id, paid_at, failure_reason, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  const rows = payouts || []

  // Summary calculations
  const totalPaid = rows
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0)

  const pendingCount = rows.filter((p) => p.status === 'pending' || p.status === 'processing').length

  const fmt = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
    }).format(amount)

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px]">
            {t('status.paid')}
          </Badge>
        )
      case 'processing':
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 text-[10px]">
            {t('status.processing')}
          </Badge>
        )
      case 'pending':
        return (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px]">
            {t('status.pending')}
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive" className="text-[10px]">
            {t('status.failed')}
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-[10px]">
            {status}
          </Badge>
        )
    }
  }

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
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                    {fmt(totalPaid, 'USD')}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {t('stats.totalPaidDesc')}
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
                    {t('stats.pendingCount')}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                    {pendingCount}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {t('stats.pendingCountDesc')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                  <IconClock className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
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
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.period')}
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.amount')}
                    </TableHead>
                    <TableHead className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.status')}
                    </TableHead>
                    <TableHead className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.paidAt')}
                    </TableHead>
                    <TableHead className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.stripeRef')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length > 0 ? (
                    rows.map((payout) => (
                      <TableRow
                        key={payout.payout_id}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {payout.period_start
                            ? format(new Date(payout.period_start), 'MMM d, yyyy', { locale: dateLocale })
                            : '—'}
                          {' – '}
                          {payout.period_end
                            ? format(new Date(payout.period_end), 'MMM d, yyyy', { locale: dateLocale })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {fmt(payout.amount || 0, payout.currency || 'USD')}
                        </TableCell>
                        <TableCell>
                          {statusBadge(payout.status || '')}
                          {payout.failure_reason && (
                            <p className="mt-0.5 text-[10px] text-destructive">{payout.failure_reason}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {payout.paid_at
                            ? format(new Date(payout.paid_at), 'MMM d, yyyy HH:mm', { locale: dateLocale })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {payout.stripe_payout_id ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                              {payout.stripe_payout_id.length > 24
                                ? `${payout.stripe_payout_id.slice(0, 12)}…${payout.stripe_payout_id.slice(-8)}`
                                : payout.stripe_payout_id}
                            </code>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <IconBuildingBank className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('empty.title')}</p>
                            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                              {t('empty.description')}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
