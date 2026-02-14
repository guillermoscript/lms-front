import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  IconUsers,
  IconBook,
  IconCertificate,
  IconCurrencyDollar,
  IconChecklist,
  IconReceipt,
  IconChartBar,
  IconCrown,
  IconSettings,
} from '@tabler/icons-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get platform statistics
  const [
    { count: totalUsers },
    { count: totalCourses },
    { count: publishedCourses },
    { count: totalEnrollments },
    { count: totalTransactions },
    { count: pendingPaymentRequests },
    { count: activeSubscriptions },
    { data: recentTransactions },
    { data: recentUsers },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }),
    supabase.from('transactions').select('*', { count: 'exact', head: true }),
    supabase
      .from('payment_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'contacted', 'payment_received']),
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active'),
    supabase
      .from('transactions')
      .select('transaction_id, amount, status, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // Get user details for transactions
  const transactionsWithUsers = await Promise.all(
    (recentTransactions || []).map(async (t) => {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', t.user_id)
        .single()
      return { ...t, user: userProfile }
    })
  )

  // Calculate total revenue (successful transactions)
  const { data: successfulTransactions } = await supabase
    .from('transactions')
    .select('amount')
    .eq('status', 'successful')

  const totalRevenue =
    successfulTransactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  const stats = [
    {
      title: 'Total Users',
      value: totalUsers || 0,
      icon: IconUsers,
      link: '/dashboard/admin/users',
      color: 'text-blue-500',
    },
    {
      title: 'Active Subscriptions',
      value: activeSubscriptions || 0,
      subtitle: 'Monthly recurring',
      icon: IconCrown,
      link: '/dashboard/admin/subscriptions',
      color: 'text-purple-500',
    },
    {
      title: 'Total Courses',
      value: totalCourses || 0,
      subtitle: `${publishedCourses || 0} published`,
      icon: IconBook,
      link: '/dashboard/admin/courses',
      color: 'text-green-500',
    },
    {
      title: 'Pending Payments',
      value: pendingPaymentRequests || 0,
      subtitle: 'Awaiting action',
      icon: IconReceipt,
      link: '/dashboard/admin/payment-requests',
      color: 'text-orange-500',
    },
    {
      title: 'Total Revenue',
      value: `$${totalRevenue.toFixed(2)}`,
      subtitle: `${totalTransactions || 0} transactions`,
      icon: IconCurrencyDollar,
      link: '/dashboard/admin/transactions',
      color: 'text-yellow-500',
    },
  ]

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.link}>
            <Card className="transition-all hover:border-primary/50 hover:shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                    {stat.subtitle && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stat.subtitle}
                      </p>
                    )}
                  </div>
                  <stat.icon className={`h-10 w-10 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconChecklist className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-8">
            <Link href="/dashboard/admin/analytics">
              <Button variant="outline" className="w-full">
                <IconChartBar className="mr-2 h-4 w-4" />
                Analytics
              </Button>
            </Link>
            <Link href="/dashboard/admin/users">
              <Button variant="outline" className="w-full">
                <IconUsers className="mr-2 h-4 w-4" />
                Manage Users
              </Button>
            </Link>
            <Link href="/dashboard/admin/courses">
              <Button variant="outline" className="w-full">
                <IconBook className="mr-2 h-4 w-4" />
                Manage Courses
              </Button>
            </Link>
            <Link href="/dashboard/admin/subscriptions">
              <Button variant="outline" className="w-full">
                <IconCrown className="mr-2 h-4 w-4" />
                Subscriptions
              </Button>
            </Link>
            <Link href="/dashboard/admin/payment-requests">
              <Button variant="outline" className="w-full">
                <IconReceipt className="mr-2 h-4 w-4" />
                Payment Requests
              </Button>
            </Link>
            <Link href="/dashboard/admin/transactions">
              <Button variant="outline" className="w-full">
                <IconCurrencyDollar className="mr-2 h-4 w-4" />
                View Transactions
              </Button>
            </Link>
            <Link href="/dashboard/admin/enrollments">
              <Button variant="outline" className="w-full">
                <IconCertificate className="mr-2 h-4 w-4" />
                View Enrollments
              </Button>
            </Link>
            <Link href="/dashboard/admin/settings">
              <Button variant="outline" className="w-full">
                <IconSettings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Recent Users</span>
              <Link href="/dashboard/admin/users">
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentUsers && recentUsers.length > 0 ? (
                recentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{user.full_name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  No recent users
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Recent Transactions</span>
              <Link href="/dashboard/admin/transactions">
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transactionsWithUsers && transactionsWithUsers.length > 0 ? (
                transactionsWithUsers.map((transaction) => (
                  <div
                    key={transaction.transaction_id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {transaction.user?.full_name || 'Unknown User'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.user?.email}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${transaction.amount.toFixed(2)}</p>
                      <p
                        className={`text-xs ${transaction.status === 'successful'
                          ? 'text-green-500'
                          : transaction.status === 'pending'
                            ? 'text-yellow-500'
                            : 'text-red-500'
                          }`}
                      >
                        {transaction.status}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  No recent transactions
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
