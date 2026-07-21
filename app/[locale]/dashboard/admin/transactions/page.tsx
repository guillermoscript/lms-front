import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

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
    .order('transaction_date', { ascending: false })

  // Get user profiles for transactions — batch fetch
  const userIds = [...new Set((transactions || []).map((t) => t.user_id).filter(Boolean))]
  const { data: users } = userIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('table.headers.id')}</TableHead>
                    <TableHead>{t('table.headers.user')}</TableHead>
                    <TableHead>{t('table.headers.amount')}</TableHead>
                    <TableHead>{t('table.headers.status')}</TableHead>
                    <TableHead>{t('table.headers.method')}</TableHead>
                    <TableHead>{t('table.headers.date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions && transactions.length > 0 ? (
                    transactions.map((transaction) => {
                      const user = usersMap.get(transaction.user_id)
                      const userName = user?.full_name || t('table.unknown')

                      return (
                        <TableRow key={transaction.transaction_id}>
                          <TableCell>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                              {transaction.transaction_id}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar size="sm">
                                <AvatarFallback>{getInitials(userName)}</AvatarFallback>
                              </Avatar>
                              <p className="font-medium">{userName}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(transaction.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                transaction.status === 'successful'
                                  ? 'default'
                                  : transaction.status === 'pending'
                                    ? 'secondary'
                                    : transaction.status === 'archived' || transaction.status === 'refunded'
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
                              {(transaction.status === 'failed' || transaction.status === 'canceled') && (
                                <IconX className="mr-1 h-3 w-3" />
                              )}
                              {tm(`recentActivity.status.${transaction.status}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {transaction.payment_method
                              ? (t.has(`table.methods.${transaction.payment_method}`)
                                  ? t(`table.methods.${transaction.payment_method}`)
                                  : transaction.payment_method)
                              : t('table.notAvailable')}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-muted-foreground">
                            {format(new Date(transaction.transaction_date), 'MMM d, yyyy HH:mm', { locale: dateLocale })}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <IconCurrencyDollar className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{t('table.empty')}</p>
                            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                              {t('description')}
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
