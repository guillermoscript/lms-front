import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { IconAlertCircle, IconBuildingBank, IconClock, IconCalendarMonth, IconInfoCircle } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { DEFAULT_SCHOOL_PERCENTAGE } from '@/lib/payments/payouts-owed'
import { formatByCurrency } from '@/lib/payments/format-money'
import {
  buildEarningsView,
  earningsTxnFromRow,
  EARNINGS_TXN_COLUMNS,
  EARNINGS_PROVIDERS,
  PLATFORM_COLLECTED_PROVIDERS,
  SCHOOL_COLLECTED_PROVIDERS,
  type RawSearchParams,
  type EarningsTxn,
  type TransactionRowForEarnings,
} from '@/lib/payments/earnings'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EarningsTable, type EarningsTableRow, type EarningsInitialFilters } from '@/components/admin/earnings-table'
import { FeeBalanceCard } from '@/components/admin/platform-fees/fee-balance-card'

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
    // Unfiltered and unpaged: the table filters, sorts and pages client-side.
    searchParams: {},
    pageSize: Number.MAX_SAFE_INTEGER,
  })

  const { page: pageData } = view

  // Product / plan names for every listed sale (the table filters, sorts and
  // pages client-side over the full, count-verified list).
  const [products, plans] = await Promise.all([
    fetchAllRows('products', (from, to) =>
      supabase
        .from('products')
        .select('product_id, name', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('product_id')
        .range(from, to),
    ),
    fetchAllRows('plans', (from, to) =>
      supabase
        .from('plans')
        .select('plan_id, plan_name', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('plan_id')
        .range(from, to),
    ),
  ])
  const productName = new Map(products.map((p) => [p.product_id, p.name]))
  const planName = new Map(plans.map((p) => [p.plan_id, p.plan_name]))

  const tableRows: EarningsTableRow[] = pageData.items.map((r) => ({
    transactionId: r.transactionId,
    label:
      (r.productId != null && productName.get(r.productId)) ||
      (r.planId != null && planName.get(r.planId)) ||
      `#${r.transactionId}`,
    transactionDate: r.transactionDate,
    month: new Date(r.transactionDate).toISOString().slice(0, 7),
    paymentProvider: r.paymentProvider,
    providerLabel: providerLabel(r.paymentProvider),
    collectedBy: r.collectedBy,
    currencyCode: r.currencyCode,
    kept: r.kept,
    commission: r.commission,
    net: r.net,
    fxRateToUsd: r.fxRateToUsd ?? null,
    fxRateSource: r.fxRateSource ?? null,
    status:
      r.status === 'pending'
        ? 'pending'
        : r.status === 'refunded'
          ? 'refunded'
          : (r.refundedAmount ?? 0) > 0
            ? 'partiallyRefunded'
            : 'successful',
  }))

  // Legacy ?status= / ?collector= / ?currency= links seed the table's filters.
  const statusParam = typeof sp.status === 'string' ? sp.status : undefined
  const collectorParam = typeof sp.collector === 'string' ? sp.collector : undefined
  const currencyParam = typeof sp.currency === 'string' ? sp.currency.toUpperCase() : undefined
  const initialFilters: EarningsInitialFilters = {
    status:
      statusParam === 'counted'
        ? ['successful', 'partiallyRefunded']
        : statusParam === 'pending'
          ? ['pending']
          : statusParam === 'refunded'
            ? ['refunded', 'partiallyRefunded']
            : undefined,
    collectedBy: collectorParam === 'school' || collectorParam === 'platform' ? [collectorParam] : undefined,
    currencyCode: currencyParam && view.currencies.includes(currencyParam) ? [currencyParam] : undefined,
  }

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
          <FeeBalanceCard
            tenantId={tenantId}
            locale={locale}
            paymentReturned={typeof sp.fee_payment === 'string'}
            paypalReturn={typeof sp.paypal === 'string' ? sp.paypal : undefined}
          />
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
          </CardHeader>
          <CardContent>
            <EarningsTable rows={tableRows} currencies={view.currencies} initialFilters={initialFilters} />
            <p className="mt-3 text-[11px] text-muted-foreground">{t('table.footnote')}</p>
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
