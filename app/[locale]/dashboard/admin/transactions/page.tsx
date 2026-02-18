import { createClient } from '@/lib/supabase/server'
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

export default async function AdminTransactionsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.transactions')
  const tm = await getTranslations('dashboard.admin.main')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get all transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })

  // Get user profiles for transactions
  const userIds = transactions?.map((t) => t.user_id) || []
  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  const usersMap = new Map(users?.map((u) => [u.id, u]))

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
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              {t('backToDashboard')}
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
              <p className="mt-1 text-muted-foreground">
                {t('description')}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.totalRevenue')}</p>
                  <p className="mt-2 text-3xl font-bold">
                    {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(totalRevenue)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('stats.totalRevenueDesc')}
                  </p>
                </div>
                <IconCurrencyDollar className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.pending')}</p>
                  <p className="mt-2 text-3xl font-bold">
                    {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(pendingAmount)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('stats.pendingDesc')}
                  </p>
                </div>
                <IconClock className="h-10 w-10 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.failed')}</p>
                  <p className="mt-2 text-3xl font-bold">{failedCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('stats.failedDesc')}
                  </p>
                </div>
                <IconX className="h-10 w-10 text-red-500" />
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
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">{t('table.headers.id')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.user')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.amount')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.status')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.method')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.date')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions && transactions.length > 0 ? (
                    transactions.map((transaction) => {
                      const user = usersMap.get(transaction.user_id)

                      return (
                        <tr key={transaction.transaction_id} className="text-sm">
                          <td className="py-4">
                            <code className="rounded bg-muted px-2 py-1 text-xs">
                              {transaction.transaction_id}
                            </code>
                          </td>
                          <td className="py-4">
                            <div>
                              <p className="font-medium">{user?.full_name || t('table.unknown')}</p>
                              <p className="text-xs text-muted-foreground">
                                {user?.email}
                              </p>
                            </div>
                          </td>
                          <td className="py-4 font-medium">
                            {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(transaction.amount)}
                          </td>
                          <td className="py-4">
                            <Badge
                              variant={
                                transaction.status === 'successful'
                                  ? 'default'
                                  : transaction.status === 'pending'
                                    ? 'secondary'
                                    : 'destructive'
                              }
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
                          <td className="py-4 text-muted-foreground">
                            {transaction.payment_method ? (t(`table.methods.${transaction.payment_method}`) || transaction.payment_method) : t('table.notAvailable')}
                          </td>
                          <td className="py-4 text-muted-foreground">
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
