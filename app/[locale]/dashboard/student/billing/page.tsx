import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconCreditCard,
  IconReceipt,
  IconFileInvoice,
  IconPackage,
  IconRefresh,
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconX,
  IconBrandStripe,
  IconWallet,
  IconCoin,
  IconDownload,
  IconInfoCircle,
} from '@tabler/icons-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type TransactionStatus = 'successful' | 'pending' | 'failed' | 'canceled' | 'refunded' | 'archived'
type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'renewed' | 'past_due'

interface Transaction {
  transaction_id: number
  amount: number
  currency: string | null
  transaction_date: string
  status: TransactionStatus
  payment_provider: string | null
  product_id: number | null
  plan_id: number | null
}

interface Subscription {
  subscription_id: number
  subscription_status: SubscriptionStatus
  current_period_end: string | null
  end_date: string
  cancel_at_period_end: boolean | null
  plan_id: number
  payment_provider: string
}

interface PaymentRequest {
  request_id: number
  status: string
  payment_amount: number | null
  payment_currency: string | null
  invoice_number: string | null
  created_at: string
  product_id: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr))
}

function getTransactionStatusMeta(status: TransactionStatus): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  icon: React.ReactNode
  className: string
} {
  switch (status) {
    case 'successful':
      return {
        variant: 'default',
        icon: <IconCheck className="w-3 h-3" />,
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      }
    case 'pending':
      return {
        variant: 'secondary',
        icon: <IconClock className="w-3 h-3" />,
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      }
    case 'refunded':
      return {
        variant: 'secondary',
        icon: <IconRefresh className="w-3 h-3" />,
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
      }
    case 'failed':
    case 'canceled':
    case 'archived':
    default:
      return {
        variant: 'destructive',
        icon: <IconX className="w-3 h-3" />,
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
      }
  }
}

function getSubscriptionStatusMeta(status: SubscriptionStatus): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className: string
} {
  switch (status) {
    case 'active':
    case 'renewed':
      return {
        variant: 'default',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      }
    case 'past_due':
      return {
        variant: 'secondary',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      }
    case 'canceled':
    case 'expired':
    default:
      return {
        variant: 'destructive',
        className: 'bg-muted text-muted-foreground border-border',
      }
  }
}

function ProviderIcon({ provider }: { provider: string | null }) {
  switch (provider) {
    case 'stripe':
      return <IconBrandStripe className="w-3.5 h-3.5 shrink-0" />
    case 'solana':
    case 'solana_subs':
      return <IconWallet className="w-3.5 h-3.5 shrink-0" />
    case 'lemonsqueezy':
      return <IconCoin className="w-3.5 h-3.5 shrink-0" />
    case 'paypal':
      return <IconCreditCard className="w-3.5 h-3.5 shrink-0" />
    default:
      return <IconPackage className="w-3.5 h-3.5 shrink-0" />
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentBillingPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const tenantId = await getCurrentTenantId()
  const supabase = await createClient()
  const t = await getTranslations('dashboard.student.billing')

  // ── 1. Transactions ─────────────────────────────────────────────────────────
  const { data: rawTransactions } = await supabase
    .from('transactions')
    .select('transaction_id, amount, currency, transaction_date, status, payment_provider, product_id, plan_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('transaction_date', { ascending: false })

  const transactions: Transaction[] = (rawTransactions ?? []) as Transaction[]

  // Resolve product / plan names
  const productIds = [...new Set(transactions.filter((tx) => tx.product_id).map((tx) => tx.product_id!))]
  const planIds = [...new Set(transactions.filter((tx) => tx.plan_id).map((tx) => tx.plan_id!))]

  const [productsRes, plansRes] = await Promise.all([
    productIds.length > 0
      ? supabase.from('products').select('product_id, name').in('product_id', productIds)
      : Promise.resolve({ data: [] }),
    planIds.length > 0
      ? supabase.from('plans').select('plan_id, plan_name').in('plan_id', planIds)
      : Promise.resolve({ data: [] }),
  ])

  const productMap = new Map((productsRes.data ?? []).map((p: any) => [p.product_id, p.name as string]))
  const planMap = new Map((plansRes.data ?? []).map((p: any) => [p.plan_id, p.plan_name as string]))

  // ── 2. Subscriptions ────────────────────────────────────────────────────────
  const { data: rawSubs } = await supabase
    .from('subscriptions')
    .select('subscription_id, subscription_status, current_period_end, end_date, cancel_at_period_end, plan_id, payment_provider')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('created', { ascending: false })

  const subscriptions: Subscription[] = (rawSubs ?? []) as Subscription[]

  // Collect extra plan ids from subscriptions not already in planMap
  const subPlanIds = [...new Set(subscriptions.map((s) => s.plan_id).filter((id) => !planMap.has(id)))]
  if (subPlanIds.length > 0) {
    const { data: extraPlans } = await supabase
      .from('plans')
      .select('plan_id, plan_name')
      .in('plan_id', subPlanIds)
    ;(extraPlans ?? []).forEach((p: any) => planMap.set(p.plan_id, p.plan_name))
  }

  // ── 3. Payment Requests (offline/manual) ────────────────────────────────────
  const { data: rawRequests } = await supabase
    .from('payment_requests')
    .select('request_id, status, payment_amount, payment_currency, invoice_number, created_at, product_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  const paymentRequests: PaymentRequest[] = (rawRequests ?? []) as PaymentRequest[]

  // Resolve product names for payment_requests not already in productMap
  const prProductIds = [...new Set(paymentRequests.filter((r) => r.product_id && !productMap.has(r.product_id)).map((r) => r.product_id!))]
  if (prProductIds.length > 0) {
    const { data: prProducts } = await supabase
      .from('products')
      .select('product_id, name')
      .in('product_id', prProductIds)
    ;(prProducts ?? []).forEach((p: any) => productMap.set(p.product_id, p.name))
  }

  // Derived
  const activeSubscription = subscriptions.find(
    (s) => s.subscription_status === 'active' || s.subscription_status === 'renewed'
  )

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <IconCreditCard className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* ── Active Subscription ────────────────────────────────────────────── */}
      <section aria-labelledby="subscription-heading">
        <h2 id="subscription-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t('subscription.sectionTitle')}
        </h2>
        {activeSubscription ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    {planMap.get(activeSubscription.plan_id) ?? t('subscription.unknownPlan')}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <ProviderIcon provider={activeSubscription.payment_provider} />
                    {t(`provider.${activeSubscription.payment_provider}` as any) ?? activeSubscription.payment_provider}
                  </p>
                </div>
                <Badge
                  className={`gap-1 text-xs ${getSubscriptionStatusMeta(activeSubscription.subscription_status).className}`}
                  variant="outline"
                >
                  {t(`subscription.status.${activeSubscription.subscription_status}` as any)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {/* Renewal / expiry date */}
              {(activeSubscription.current_period_end ?? activeSubscription.end_date) && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {activeSubscription.cancel_at_period_end
                      ? t('subscription.cancelsOn')
                      : t('subscription.renewsOn')}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatDate(activeSubscription.current_period_end ?? activeSubscription.end_date)}
                  </span>
                </div>
              )}
              {/* Cancel-at-period-end notice */}
              {activeSubscription.cancel_at_period_end && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                  <IconAlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {t('subscription.cancelAtPeriodEndNotice', {
                      date: formatDate(activeSubscription.current_period_end ?? activeSubscription.end_date),
                    })}
                  </span>
                </div>
              )}
              {/* No self-cancel note */}
              <div className="flex items-start gap-2 rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                <IconInfoCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{t('subscription.cancelNote')}</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t('subscription.empty')}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Purchase History ───────────────────────────────────────────────── */}
      <section aria-labelledby="purchases-heading">
        <h2 id="purchases-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t('purchases.sectionTitle')}
        </h2>
        <Card>
          {transactions.length === 0 ? (
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t('purchases.empty')}
            </CardContent>
          ) : (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('purchases.table.item')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                        {t('purchases.table.provider')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                        {t('purchases.table.date')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('purchases.table.status')}
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('purchases.table.amount')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {transactions.map((tx) => {
                      const itemName =
                        (tx.product_id ? productMap.get(tx.product_id) : null) ??
                        (tx.plan_id ? planMap.get(tx.plan_id) : null) ??
                        t('purchases.unknownItem')
                      const statusMeta = getTransactionStatusMeta(tx.status)
                      return (
                        <tr key={tx.transaction_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium max-w-[160px] truncate" title={itemName}>
                            {itemName}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="flex items-center gap-1 text-muted-foreground text-xs">
                              <ProviderIcon provider={tx.payment_provider} />
                              {tx.payment_provider
                                ? (t(`provider.${tx.payment_provider}` as any) ?? tx.payment_provider)
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell tabular-nums">
                            {formatDate(tx.transaction_date)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={`gap-1 text-xs ${statusMeta.className}`}
                            >
                              {statusMeta.icon}
                              {t(`purchases.status.${tx.status}` as any)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {formatCurrency(Number(tx.amount), tx.currency ?? 'USD')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      </section>

      {/* ── Offline / Manual Payments ──────────────────────────────────────── */}
      {paymentRequests.length > 0 && (
        <section aria-labelledby="offline-heading">
          <h2 id="offline-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {t('offline.sectionTitle')}
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('offline.table.product')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                        {t('offline.table.date')}
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('offline.table.status')}
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('offline.table.amount')}
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('offline.table.invoice')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paymentRequests.map((req) => {
                      const productName = req.product_id ? (productMap.get(req.product_id) ?? t('purchases.unknownItem')) : t('purchases.unknownItem')
                      return (
                        <tr key={req.request_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium max-w-[160px] truncate" title={productName}>
                            {productName}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell tabular-nums">
                            {formatDate(req.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className="text-xs">
                              {req.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {req.payment_amount != null
                              ? formatCurrency(Number(req.payment_amount), req.payment_currency ?? 'USD')
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {req.invoice_number ? (
                              <Link
                                href={`/api/invoices/${req.invoice_number}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:underline outline-none"
                                aria-label={t('offline.downloadInvoiceLabel', { number: req.invoice_number })}
                              >
                                <IconDownload className="w-3.5 h-3.5" />
                                {t('offline.downloadInvoice')}
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          {/* Link back to the detailed payments page */}
          <p className="mt-2 text-xs text-muted-foreground">
            {t('offline.managePaymentsNote')}{' '}
            <Link href="/dashboard/student/payments" className="text-primary hover:underline focus-visible:underline outline-none">
              {t('offline.managePaymentsLink')}
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}
