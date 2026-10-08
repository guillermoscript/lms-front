import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { IconAlertCircle, IconClock, IconCoin, IconCalendarMonth, IconReceipt } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { computeOwedBalances, DEFAULT_SCHOOL_PERCENTAGE } from '@/lib/payments/payouts-owed'
import { formatByCurrency, formatMoney } from '@/lib/payments/format-money'
import {
  filterEarnings,
  monthTotals,
  paginate,
  toEarningsRow,
  type EarningsStatusFilter,
} from '@/lib/payments/earnings'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const PAGE_SIZE = 20

// Only providers whose money lands in the PLATFORM account create a balance
// the platform owes the school (Stripe Connect / Solana / manual split or
// settle straight to the school).
const PLATFORM_SETTLED_PROVIDERS = (Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]).filter(
  (p) => PROVIDER_CAPABILITIES[p].settlesToPlatformAccount,
)

type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const isoDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

export default async function AdminEarningsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}) {
  const { locale } = await params
  const sp = await searchParams
  const t = await getTranslations('dashboard.admin.earnings')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

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
  const [txns, paid, split, pendingRequests] = await Promise.all([
    fetchAllRows('transactions', (from, to) =>
      supabase
        .from('transactions')
        .select(
          'transaction_id, payment_provider, amount, refunded_amount, currency, school_percentage_snapshot, status, transaction_date, product_id, plan_id',
          { count: 'exact' },
        )
        .eq('tenant_id', tenantId)
        .in('status', ['successful', 'refunded', 'pending'])
        .in('payment_provider', PLATFORM_SETTLED_PROVIDERS)
        .order('transaction_id')
        .range(from, to),
    ),
    fetchAllRows('payouts', (from, to) =>
      supabase
        .from('payouts')
        .select('tenant_id, amount, currency, period_end, paid_at, created_at', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('payout_method', 'manual')
        .eq('status', 'paid')
        .order('payout_id')
        .range(from, to),
    ),
    supabase.from('revenue_splits').select('school_percentage').eq('tenant_id', tenantId).maybeSingle(),
    supabase
      .from('payment_requests')
      .select('request_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending'),
  ])

  const schoolPercentage = (split.data?.school_percentage as number | undefined) ?? DEFAULT_SCHOOL_PERCENTAGE

  // Balance: the same pure function getPayoutsOwed uses, over this tenant only.
  const [owed] = computeOwedBalances(
    [{ tenantId, tenantName: '', schoolPercentage }],
    txns
      .filter((r) => r.payment_provider && r.amount != null && r.status !== 'pending')
      .map((r) => ({
        tenantId,
        paymentProvider: r.payment_provider as string,
        amount: r.amount as number,
        refundedAmount: r.refunded_amount as number | null,
        currency: r.currency || 'usd',
        schoolPercentageSnapshot: r.school_percentage_snapshot as number | null,
        status: r.status as 'successful' | 'refunded',
        transactionDate: r.transaction_date as string | null,
      })),
    paid.map((p) => ({
      tenantId,
      amount: p.amount,
      currency: p.currency || 'usd',
      coveredThrough: p.period_end ?? p.paid_at ?? p.created_at,
    })),
  )
  const owedByCurrency: Record<string, number> = {}
  for (const b of owed?.balances ?? []) {
    if (b.netOwed > 0) owedByCurrency[b.currency.toUpperCase()] = b.netOwed
  }

  const allRows = txns
    .filter((r) => r.payment_provider && r.amount != null)
    .map((r) =>
      toEarningsRow(
        {
          transactionId: r.transaction_id as number,
          paymentProvider: r.payment_provider as string,
          amount: r.amount as number,
          refundedAmount: r.refunded_amount as number | null,
          currency: r.currency || 'usd',
          schoolPercentageSnapshot: r.school_percentage_snapshot as number | null,
          status: r.status as 'successful' | 'refunded' | 'pending',
          transactionDate: r.transaction_date as string,
          productId: r.product_id as number | null,
          planId: r.plan_id as number | null,
        },
        schoolPercentage,
      ),
    )
    .sort((a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate) || b.transactionId - a.transactionId)

  const month = monthTotals(allRows, new Date())

  const statusParam = first(sp.status)
  const status: EarningsStatusFilter = statusParam === 'payable' || statusParam === 'pending' ? statusParam : 'all'
  const currencies = Array.from(new Set(allRows.map((r) => r.currency.toUpperCase()))).sort()
  const currencyParam = first(sp.currency)?.toUpperCase()
  const currency = currencyParam && currencies.includes(currencyParam) ? currencyParam : null
  const from = isoDate(first(sp.from))
  const to = isoDate(first(sp.to))

  const filtered = filterEarnings(allRows, { status, currency, from, to })
  const pageData = paginate(filtered, Number(first(sp.page)) || 1, PAGE_SIZE)

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
    const cur: Record<string, string | number | null> = { status: status === 'all' ? null : status, currency, from, to, page: null, ...over }
    for (const [k, v] of Object.entries(cur)) if (v != null && v !== '') q.set(k, String(v))
    const s = q.toString()
    return `/${locale}/dashboard/admin/earnings${s ? `?${s}` : ''}`
  }

  const statusBadge = (s: string) =>
    s === 'successful' ? (
      <Badge className="bg-success/10 text-success border-success/30 text-[10px]">{t('status.successful')}</Badge>
    ) : s === 'pending' ? (
      <Badge className="bg-warning/10 text-warning border-warning/30 text-[10px]">{t('status.pending')}</Badge>
    ) : (
      <Badge variant="secondary" className="text-[10px]">{t('status.refunded')}</Badge>
    )

  const pendingRequestCount = pendingRequests.count ?? 0

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

      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.owed')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums break-words" data-testid="earnings-owed">
                    {formatByCurrency(owedByCurrency, locale)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('stats.owedDesc')}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
                  <IconCoin className="h-[18px] w-[18px] text-brand-text" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.month')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums break-words" data-testid="earnings-month">
                    {formatByCurrency(month.byCurrency, locale)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('stats.monthDesc', { count: month.count })}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
                  <IconCalendarMonth className="h-[18px] w-[18px] text-brand-text" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.toConfirm')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums" data-testid="earnings-to-confirm">
                    {pendingRequestCount}
                  </p>
                  <Link href={`/${locale}/dashboard/admin/payment-requests`} className="mt-1 inline-block text-[11px] text-brand-text underline-offset-2 hover:underline">
                    {t('stats.toConfirmLink')}
                  </Link>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <IconClock className="h-[18px] w-[18px] text-warning" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-3">
            <CardTitle>{t('table.title')}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'payable', 'pending'] as const).map((s) => (
                <Link key={s} href={qs({ status: s === 'all' ? null : s })} aria-current={status === s ? 'true' : undefined}>
                  <Button variant={status === s ? 'default' : 'outline'} size="sm" type="button">
                    {t(`filters.${s}`)}
                  </Button>
                </Link>
              ))}
            </div>
            <form method="get" className="flex flex-wrap items-end gap-3" data-testid="earnings-filters">
              {status !== 'all' && <input type="hidden" name="status" value={status} />}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filters.currency')}
                <select name="currency" defaultValue={currency ?? ''} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="">{t('filters.allCurrencies')}</option>
                  {currencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filters.from')}
                <input type="date" name="from" defaultValue={from ?? ''} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('filters.to')}
                <input type="date" name="to" defaultValue={to ?? ''} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" />
              </label>
              <Button type="submit" size="sm" variant="outline">{t('filters.apply')}</Button>
            </form>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    {(['product', 'date', 'origin', 'amount', 'commission', 'net', 'status'] as const).map((h) => (
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
                      <TableRow key={r.transactionId} className="transition-colors hover:bg-muted/40" data-testid="earnings-row">
                        <TableCell className="max-w-[14rem] truncate">
                          {(r.productId != null && productName.get(r.productId)) ||
                            (r.planId != null && planName.get(r.planId)) ||
                            `#${r.transactionId}`}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {format(new Date(r.transactionDate), 'MMM d, yyyy', { locale: dateLocale })}
                        </TableCell>
                        <TableCell className="text-xs capitalize text-muted-foreground">{r.paymentProvider}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.kept, r.currency, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatMoney(r.commission, r.currency, locale)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatMoney(r.net, r.currency, locale)}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center">
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
