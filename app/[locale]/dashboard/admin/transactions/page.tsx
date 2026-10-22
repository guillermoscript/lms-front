import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  IconCurrencyDollar,
  IconX,
  IconClock,
} from '@tabler/icons-react'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { TransactionsTable } from '@/components/admin/transactions-table'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { netOfRefunds } from '@/lib/payments/payouts-owed'

export default async function AdminTransactionsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.transactions')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Every transaction for this tenant, paged and count-verified (#548): the
  // stat cards below sum this list, and PostgREST silently caps a plain
  // response at 1000 rows. Stable order on the PK keeps the windows disjoint;
  // the newest-first display order is applied after.
  const rows = await fetchAllRows('transactions', (from, to) =>
    supabase
      .from('transactions')
      .select(
        'transaction_id, user_id, amount, refunded_amount, status, payment_method, transaction_date',
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId)
      .order('transaction_id')
      .range(from, to),
  )
  const transactions = [...rows].sort(
    (a, b) => (b.transaction_date ?? '').localeCompare(a.transaction_date ?? ''),
  )

  // Get user profiles for transactions — batch fetch
  const userIds = [...new Set((transactions || []).map((t) => t.user_id).filter(Boolean))]
  // Chunked: a long `.in()` list overflows the request URL.
  const users: { id: string; full_name: string | null }[] = []
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds.slice(i, i + 200))
    users.push(...(data || []))
  }

  const usersMap = new Map((users || []).map((u) => [u.id, u]))

  // Calculate totals
  // Net of refunds (#547): a partially refunded sale keeps status 'successful'
  // and records the slice, so `amount` alone overstates what was kept.
  // `pendingAmount` below needs no such treatment — a pending sale has no refund.
  const totalRevenue =
    transactions
      ?.filter((t) => t.status === 'successful')
      .reduce((sum, t) => sum + netOfRefunds(t.amount || 0, t.refunded_amount), 0) || 0

  const pendingAmount =
    transactions
      ?.filter((t) => t.status === 'pending')
      .reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  const failedCount =
    transactions?.filter((t) => t.status === 'failed').length || 0

  return (
    <div className="min-h-screen bg-background" data-testid="transactions-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: tBreadcrumbs('transactions') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.totalRevenue')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                    {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(totalRevenue)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('stats.totalRevenueDesc')}
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
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.pending')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                    {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(pendingAmount)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('stats.pendingDesc')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <IconClock className="h-[18px] w-[18px] text-warning" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.failed')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{failedCount}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('stats.failedDesc')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                  <IconX className="h-[18px] w-[18px] text-destructive" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('table.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionsTable
              transactions={(transactions || []).map((tx) => ({
                id: String(tx.transaction_id),
                userName: usersMap.get(tx.user_id)?.full_name ?? null,
                amount: Number(tx.amount) || 0,
                status: tx.status,
                method: tx.payment_method ?? null,
                date: tx.transaction_date,
              }))}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
