import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  IconArrowLeft,
  IconCurrencyDollar,
  IconCheck,
  IconX,
  IconClock,
} from '@tabler/icons-react'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

export default async function AdminTransactionsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.transactions')
  const tm = await getTranslations('dashboard.admin.main')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Get all transactions for this tenant
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  // Get user profiles for transactions — batch fetch
  const userIds = [...new Set((transactions || []).map((t) => t.user_id).filter(Boolean))]
  const { data: users } = userIds.length > 0
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] }

  const usersMap = new Map((users || []).map((u) => [u.id, u]))

  // Calculate totals
  const totalRevenue =
    transactions
      ?.filter((t) => t.status === 'successful')
      .reduce((sum, t) => sum + (t.amount || 0), 0) || 0

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
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
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

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {t('stats.totalRevenueDesc')}
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
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.pending')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                    {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(pendingAmount)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {t('stats.pendingDesc')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                  <IconClock className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
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
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {t('stats.failedDesc')}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40">
                  <IconX className="h-[18px] w-[18px] text-red-600 dark:text-red-400" strokeWidth={1.75} />
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.id')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.user')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.amount')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.status')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.method')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions && transactions.length > 0 ? (
                    transactions.map((transaction) => {
                      const user = usersMap.get(transaction.user_id)

                      return (
                        <tr key={transaction.transaction_id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                              {transaction.transaction_id}
                            </code>
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium">{user?.full_name || t('table.unknown')}</p>
                              <p className="text-[11px] text-muted-foreground/70">
                                {user?.email}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold tabular-nums">
                            {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(transaction.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                transaction.status === 'successful'
                                  ? 'default'
                                  : transaction.status === 'pending'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                              className={`text-[10px] ${transaction.status === 'successful' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}`}
                            >
                              {transaction.status === 'successful' && (
                                <IconCheck className="mr-1 h-3 w-3" />
                              )}
                              {transaction.status === 'pending' && (
                                <IconClock className="mr-1 h-3 w-3" />
                              )}
                              {transaction.status === 'failed' && (
                                <IconX className="mr-1 h-3 w-3" />
                              )}
                              {tm(`recentActivity.status.${transaction.status}`)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {transaction.payment_method ? (t(`table.methods.${transaction.payment_method}`) || transaction.payment_method) : t('table.notAvailable')}
                          </td>
                          <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                            {format(new Date(transaction.created_at), 'MMM d, yyyy HH:mm', { locale: dateLocale })}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('table.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
