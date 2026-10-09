import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { IconAlertCircle, IconBuildingBank, IconClock, IconCalendarMonth, IconReceipt, IconInfoCircle } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { DEFAULT_SCHOOL_PERCENTAGE } from '@/lib/payments/payouts-owed'
import { formatByCurrency, formatMoney } from '@/lib/payments/format-money'
import {
  buildEarningsView,
  earningsTxnFromRow,
  EARNINGS_TXN_COLUMNS,
  EARNINGS_PROVIDERS,
  PLATFORM_COLLECTED_PROVIDERS,
  SCHOOL_COLLECTED_PROVIDERS,
  type EarningsStatusFilter,
  type EarningsCollectorFilter,
  type RawSearchParams,
  type EarningsTxn,
  type TransactionRowForEarnings,
} from '@/lib/payments/earnings'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { FeeBalanceCard } from '@/components/admin/platform-fees/fee-balance-card'

const PAGE_SIZE = 20

/** Dates are rendered in UTC, the same zone every boundary on this page uses. */
function formatUtcDate(iso: string, locale: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d)
}

export default async function AdminEarningsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const { locale } = await params
  const sp = await searchParams
  const t = await getTranslations('dashboard.admin.earnings')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const providerLabel = (p: string) => (t.has(`providers.${p}`) ? t(`providers.${p}`) : p)

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  // proxy.ts already redirects non-admins away from /dashboard/admin/*; this
  // re-check is the page's own guard, because it reads with the admin client.
  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership || membership.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" data-testid="earnings-denied">
        <div className="text-center">
          <IconAlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold">{t('accessDenied')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('accessDeniedDesc')}</p>
        </div>
      </div>
    )
  }

  // Every read is paged and count-verified (#548): the totals sum these lists.
  // `transaction_date` — transactions has no `created_at`.
  const [txns, paid, split, openRequests, feePayments] = await Promise.all([
    fetchAllRows('transactions', (from, to) =>
      supabase
        .from('transactions')
        .select(EARNINGS_TXN_COLUMNS, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('status', ['successful', 'refunded', 'pending'])
        .in('payment_provider', EARNINGS_PROVIDERS as string[])
        .order('transaction_id')
        .range(from, to),
    ),
    fetchAllRows('payouts', (from, to) =>
      supabase
        .from('payouts')
        .select('amount, currency, period_end, paid_at, created_at', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('payout_method', 'manual')
        .eq('status', 'paid')
        .order('payout_id')
        .range(from, to),
    ),
    supabase.from('revenue_splits').select('school_percentage').eq('tenant_id', tenantId).maybeSingle(),
    // Same statuses as the "Open" tab on the payment-requests page.
    supabase
      .from('payment_requests')
      .select('request_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'contacted']),
    // Fee payments (#929) reduce the "owed to the platform" figure.
    supabase
      .from('platform_fee_payments')
      .select('amount, currency, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'succeeded'),
  ])

  if (split.error) throw new Error(`revenue_splits: ${split.error.message}`)
  if (openRequests.error) throw new Error(`payment_requests: ${openRequests.error.message}`)
  if (feePayments.error) throw new Error(`platform_fee_payments: ${feePayments.error.message}`)

  const view = buildEarningsView({
    tenantId,
    // usd_amount (#929) is in the select so a hyperinflation-currency sale
    // lands in the same USD bucket here as in platform_fee_ledger().
    txns: (txns as unknown as TransactionRowForEarnings[])
      .map(earningsTxnFromRow)
      .filter((r): r is EarningsTxn => r !== null),
    payouts: paid.map((p) => ({
      amount: Number(p.amount),
      currency: p.currency || 'usd',
      coveredThrough: p.period_end ?? p.paid_at ?? p.created_at,
    })),
    schoolPercentage: (split.data?.school_percentage as number | undefined) ?? DEFAULT_SCHOOL_PERCENTAGE,
    openRequests: openRequests.count ?? 0,
    feePayments: (feePayments.data ?? []).map((p) => ({
      amount: Number(p.amount),
      currency: String(p.currency),
      status: String(p.status),
    })),
    now: new Date(),
    searchParams: sp,
    pageSize: PAGE_SIZE,
  })

  const { filters, page: pageData } = view

  // Product / plan names for the visible page only.
  const productIds = Array.from(new Set(pageData.items.map((r) => r.productId).filter((v): v is number => v != null)))
  const planIds = Array.from(new Set(pageData.items.map((r) => r.planId).filter((v): v is number => v != null)))
  const [products, plans] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('product_id, name').eq('tenant_id', tenantId).in('product_id', productIds)
      : Promise.resolve({ data: [] as { product_id: number; name: string }[] }),
    planIds.length
      ? supabase.from('plans').select('plan_id, plan_name').eq('tenant_id', tenantId).in('plan_id', planIds)
      : Promise.resolve({ data: [] as { plan_id: number; plan_name: string }[] }),
  ])
  const productName = new Map((products.data ?? []).map((p) => [p.product_id, p.name]))
  const planName = new Map((plans.data ?? []).map((p) => [p.plan_id, p.plan_name]))

  const qs = (over: Record<string, string | number | null>) => {
    const q = new URLSearchParams()
    const cur: Record<string, string | number | null> = {
      status: filters.status === 'all' ? null : filters.status,
      collector: filters.collector === 'all' ? null : filters.collector,
      currency: filters.currency,
      from: filters.from,
      to: filters.to,
      page: null,
      ...over,
    }
    for (const [k, v] of Object.entries(cur)) if (v != null && v !== '') q.set(k, String(v))
    const s = q.toString()
    return `/${locale}/dashboard/admin/earnings${s ? `?${s}` : ''}`
  }

  const statusBadge = (s: string, refunded: boolean) =>
    s === 'pending' ? (
      <Badge className="bg-warning/10 text-warning border-warning/30 text-[10px]">{t('status.pending')}</Badge>
    ) : s === 'refunded' ? (
      <Badge variant="secondary" className="text-[10px]">{t('status.refunded')}</Badge>
    ) : refunded ? (
      <Badge variant="outline" className="text-[10px]">{t('status.partiallyRefunded')}</Badge>
    ) : (
      <Badge className="bg-success/10 text-success border-success/30 text-[10px]">{t('status.successful')}</Badge>
    )

  const debtByCurrency = Object.fromEntries(view.feeDebt.map((b) => [b.currency, b.netOwed]))
  const debtSales = view.feeDebt.reduce((n, b) => n + b.sales, 0)
  const schoolProviders = SCHOOL_COLLECTED_PROVIDERS.map(providerLabel).join(', ')
  const platformProviders = PLATFORM_COLLECTED_PROVIDERS.map(providerLabel).join(', ')

  return (
    <div className="min-h-screen bg-background" data-testid="earnings-page">
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

      <main className="mx-auto container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Scope: which sales this page covers, and which it does not. */}
        <div className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-sm" data-testid="earnings-scope">
          <IconInfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <div className="space-y-1 text-muted-foreground">
            <p>{t('scope.school', { providers: schoolProviders })}</p>
            <p>{t('scope.platform', { providers: platformProviders })}</p>
            <p>{t('scope.excluded')}</p>
            <p>{t('scope.timezone')}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border-warning/40">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.owedToPlatform')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums break-words" data-testid="earnings-owed-to-platform">
                    {formatByCurrency(debtByCurrency, locale)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('stats.owedToPlatformDesc', { count: debtSales })}
                  </p>
                  <a href="#platform-fees" className="mt-1 inline-block text-[11px] text-brand-text underline-offset-2 hover:underline">
                    {t('stats.owedToPlatformNote')}
                  </a>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <IconBuildingBank className="h-[18px] w-[18px] text-warning" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.month')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums break-words" data-testid="earnings-month">
                    {formatByCurrency(view.month.net, locale)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('stats.monthDesc', { count: view.month.count, commission: formatByCurrency(view.month.commission, locale) })}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
                  <IconCalendarMonth className="h-[18px] w-[18px] text-brand-text" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.openRequests')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums" data-testid="earnings-open-requests">
                    {view.openRequests}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('stats.openRequestsDesc')}</p>
                  <Link
                    href={`/${locale}/dashboard/admin/payment-requests?tab=open`}
                    className="mt-1 inline-block text-[11px] text-brand-text underline-offset-2 hover:underline"
                    data-testid="earnings-open-requests-link"
                  >
                    {t('stats.openRequestsLink')}
                  </Link>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <IconClock className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* #929: balance, Pay now, statements. Streams in; fixed-height skeleton, no layout shift. */}
        <Suspense fallback={<FeeBalanceSkeleton />}>
          <FeeBalanceCard tenantId={tenantId} locale={locale} paymentReturned={typeof sp.fee_payment === 'string'} />
        </Suspense>

        {/* Secondary, opposite direction: only when the school sells on a platform-collected rail. */}
        {view.hasPlatformCollectedSales && (
          <Card data-testid="earnings-platform-owes">
            <CardContent className="flex flex-col gap-1 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{t('platformOwes.title')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('platformOwes.desc', { providers: platformProviders })}</p>
              </div>
              <p className="text-lg font-semibold tabular-nums" data-testid="earnings-platform-owes-amount">
                {formatByCurrency(view.platformOwes, locale)}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="gap-3">
            <CardTitle>{t('table.title')}</CardTitle>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('filters.statusLabel')}>
              {(['all', 'counted', 'pending', 'refunded'] as const satisfies readonly EarningsStatusFilter[]).map((s) => (
                <Link key={s} href={qs({ status: s === 'all' ? null : s })} aria-current={filters.status === s ? 'true' : undefined}>
                  <Button variant={filters.status === s ? 'default' : 'outline'} size="sm" type="button">
                    {t(`filters.${s}`)}
                  </Button>
                </Link>
              ))}
            </div>
            <form method="get" className="flex flex-wrap items-end gap-3" data-testid="earnings-filters">
              {filters.status !== 'all' && <input type="hidden" name="status" value={filters.status} />}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filters.collector')}
                <select name="collector" defaultValue={filters.collector === 'all' ? '' : filters.collector} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground">
                  {(['all', 'school', 'platform'] as const satisfies readonly EarningsCollectorFilter[]).map((c) => (
                    <option key={c} value={c === 'all' ? '' : c}>{t(`filters.collectors.${c}`)}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filters.currency')}
                <select name="currency" defaultValue={filters.currency ?? ''} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="">{t('filters.allCurrencies')}</option>
                  {view.currencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filters.from')}
                <input type="date" name="from" defaultValue={filters.from ?? ''} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filters.to')}
                <input type="date" name="to" defaultValue={filters.to ?? ''} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" />
              </label>
              <Button type="submit" size="sm" variant="outline">{t('filters.apply')}</Button>
            </form>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    {(['product', 'date', 'origin', 'collectedBy', 'amount', 'commission', 'net', 'status'] as const).map((h) => (
                      <TableHead
                        key={h}
                        className={`text-[11px] font-medium uppercase tracking-wider text-muted-foreground ${['amount', 'commission', 'net'].includes(h) ? 'text-right' : 'text-left'}`}
                      >
                        {t(`table.headers.${h}`)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.items.length > 0 ? (
                    pageData.items.map((r) => (
                      <TableRow
                        key={r.transactionId}
                        className="transition-colors hover:bg-muted/40"
                        data-testid="earnings-row"
                        data-collector={r.collectedBy}
                      >
                        <TableCell className="max-w-[14rem] truncate">
                          {(r.productId != null && productName.get(r.productId)) ||
                            (r.planId != null && planName.get(r.planId)) ||
                            `#${r.transactionId}`}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                          {formatUtcDate(r.transactionDate, locale)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{providerLabel(r.paymentProvider)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t(`table.collectedBy.${r.collectedBy}`)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(r.kept, r.currencyCode, locale)}
                          {r.fxRateToUsd != null && r.fxRateToUsd > 0 && (
                            // #929: the rate frozen at sale time, so the school can reconcile in its own currency.
                            <span className="block text-[10px] text-muted-foreground" data-testid="earnings-fx-rate">
                              {t('table.fxRate', {
                                currency: r.currencyCode,
                                rate: new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(r.fxRateToUsd),
                                source: r.fxRateSource ?? '—',
                              })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatMoney(r.commission, r.currencyCode, locale)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatMoney(r.net, r.currencyCode, locale)}</TableCell>
                        <TableCell>{statusBadge(r.status, (r.refundedAmount ?? 0) > 0)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <IconReceipt className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{t('empty.title')}</p>
                            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{t('empty.description')}</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{t('table.footnote')}</p>

            {pageData.totalPages > 1 && (
              <nav className="mt-4 flex items-center justify-between text-sm" aria-label={t('pagination.label')}>
                <span className="text-xs text-muted-foreground">
                  {t('pagination.page', { page: pageData.page, total: pageData.totalPages })}
                </span>
                <div className="flex gap-2">
                  {pageData.page > 1 ? (
                    <Link href={qs({ page: pageData.page - 1 })}>
                      <Button variant="outline" size="sm" type="button">{t('pagination.prev')}</Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>{t('pagination.prev')}</Button>
                  )}
                  {pageData.page < pageData.totalPages ? (
                    <Link href={qs({ page: pageData.page + 1 })}>
                      <Button variant="outline" size="sm" type="button">{t('pagination.next')}</Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>{t('pagination.next')}</Button>
                  )}
                </div>
              </nav>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function FeeBalanceSkeleton() {
  return (
    <div className="h-64 space-y-3 rounded-xl border p-5" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-full max-w-lg" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-56" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}
