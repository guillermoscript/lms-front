import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp, Clock, AlertCircle } from 'lucide-react'
import { RevenueChart } from '@/components/teacher/revenue-chart'
import { PayoutHistory } from '@/components/teacher/payout-history'
import { TransactionList } from '@/components/teacher/transaction-list'

export default async function RevenuePage() {
  const role = await getUserRole()

  // Only teachers and admins can access revenue dashboard
  if (role !== 'teacher' && role !== 'admin') {
    redirect('/dashboard/student')
  }

  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  // Get tenant info and revenue split
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, stripe_account_id')
    .eq('id', tenantId)
    .single()

  const { data: split } = await supabase
    .from('revenue_splits')
    .select('platform_percentage, school_percentage')
    .eq('tenant_id', tenantId)
    .single()

  // Get all successful transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, status, payment_provider, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'successful')
    .order('created_at', { ascending: false })

  // Calculate revenue metrics
  const totalRevenue = transactions?.reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0
  const platformFee = totalRevenue * ((split?.platform_percentage || 20) / 100)
  const schoolRevenue = totalRevenue - platformFee

  // Get recent transactions (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentTransactions = transactions?.filter(
    t => new Date(t.created_at) >= thirtyDaysAgo
  ) || []

  const recentRevenue = recentTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0)

  // Get payout history
  const { data: payouts } = await supabase
    .from('payouts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(10)

  // Calculate pending payout
  const pendingPayout = payouts?.find(p => p.status === 'pending')?.amount || 0

  // Check if Stripe account is connected
  const isStripeConnected = !!tenant?.stripe_account_id

  return (
    <div className="container mx-auto py-8 space-y-8" data-testid="revenue-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Revenue Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Track your school's revenue and payouts
        </p>
      </div>

      {!isStripeConnected && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-amber-900">Payment Account Not Connected</CardTitle>
            </div>
            <CardDescription className="text-amber-700">
              Connect your Stripe account to start accepting payments and receiving payouts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="/api/stripe/connect"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Connect Stripe Account
            </a>
          </CardContent>
        </Card>
      )}

      {/* Revenue Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All time revenue from students
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Your Share ({split?.school_percentage || 80}%)
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${schoolRevenue.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              After platform fee deduction
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last 30 Days</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${recentRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {recentTransactions.length} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              ${pendingPayout.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting Stripe transfer
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Fee Info */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Split</CardTitle>
          <CardDescription>
            How revenue is distributed between your school and the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Platform Fee</span>
                <Badge variant="secondary">{split?.platform_percentage || 20}%</Badge>
              </div>
              <div className="text-2xl font-bold text-muted-foreground">
                ${platformFee.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                Platform maintenance and support
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Your Revenue</span>
                <Badge variant="default">{split?.school_percentage || 80}%</Badge>
              </div>
              <div className="text-2xl font-bold text-green-600">
                ${schoolRevenue.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                Paid directly to your Stripe account
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Recent Transactions</TabsTrigger>
          <TabsTrigger value="payouts">Payout History</TabsTrigger>
          <TabsTrigger value="chart">Revenue Chart</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <TransactionList transactions={transactions || []} />
        </TabsContent>

        <TabsContent value="payouts" className="space-y-4">
          <PayoutHistory payouts={payouts || []} />
        </TabsContent>

        <TabsContent value="chart" className="space-y-4">
          <RevenueChart transactions={transactions || []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
