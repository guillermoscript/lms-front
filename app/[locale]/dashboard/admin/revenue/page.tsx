import { getRevenueOverview } from '@/app/actions/admin/revenue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

export default async function RevenuePage() {
  const t = await getTranslations('dashboard.admin')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const revenue = await getRevenueOverview()

  return (
    <div className="space-y-6 md:p-6 p-2" data-testid="revenue-page">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
          { label: tBreadcrumbs('revenue') },
        ]}
      />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Revenue</h1>
        <p className="text-muted-foreground">
          Track your school&apos;s revenue and earnings
        </p>
      </div>

      {revenue.transactionCount === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No revenue data yet. Start selling courses to see your earnings here.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Revenue</CardDescription>
                <CardTitle className="text-2xl">
                  {formatCurrency(revenue.totalRevenue, revenue.currency)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {revenue.transactionCount} transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Platform Fees Paid</CardDescription>
                <CardTitle className="text-2xl text-muted-foreground">
                  {formatCurrency(revenue.platformFees, revenue.currency)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Upgrade your plan to reduce fees
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Net Revenue</CardDescription>
                <CardTitle className="text-2xl text-green-600 dark:text-green-400">
                  {formatCurrency(revenue.netRevenue, revenue.currency)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  After platform fees
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Revenue by Course */}
          {revenue.revenueByCourse.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Product</CardTitle>
                <CardDescription>Top earning products</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {revenue.revenueByCourse.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(item.amount, revenue.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Trend */}
          {revenue.monthlyTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Monthly Trend</CardTitle>
                <CardDescription>Revenue over the last 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {revenue.monthlyTrend.map((item) => {
                    const maxAmount = Math.max(...revenue.monthlyTrend.map(t => t.amount))
                    const width = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0
                    return (
                      <div key={item.month} className="flex items-center gap-3">
                        <span className="w-20 text-xs text-muted-foreground shrink-0">
                          {item.month}
                        </span>
                        <div className="flex-1">
                          <div
                            className="h-6 rounded bg-primary/20 flex items-center px-2"
                            style={{ width: `${Math.max(width, 2)}%` }}
                          >
                            <span className="text-xs font-medium">
                              {formatCurrency(item.amount, revenue.currency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
