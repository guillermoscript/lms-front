'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useMemo } from 'react'
import { BarChart } from 'lucide-react'

interface Transaction {
  amount: string
  created_at: string
}

interface RevenueChartProps {
  transactions: Transaction[]
}

export function RevenueChart({ transactions }: RevenueChartProps) {
  // Group transactions by month
  const monthlyRevenue = useMemo(() => {
    const grouped: { [key: string]: number } = {}

    transactions.forEach((transaction) => {
      const date = new Date(transaction.created_at)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      if (!grouped[monthKey]) {
        grouped[monthKey] = 0
      }
      grouped[monthKey] += parseFloat(transaction.amount)
    })

    // Convert to array and sort by date
    return Object.entries(grouped)
      .map(([month, revenue]) => ({
        month,
        revenue,
        label: new Date(month + '-01').toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
        }),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12) // Last 12 months
  }, [transactions])

  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.revenue), 0)

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revenue Chart</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Revenue trends will appear here once you have transactions
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Chart</CardTitle>
        <CardDescription>Monthly revenue trends (last 12 months)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {monthlyRevenue.map((month) => (
            <div key={month.month} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{month.label}</span>
                <span className="text-muted-foreground">${month.revenue.toFixed(2)}</span>
              </div>
              <div className="h-8 bg-secondary rounded-md overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${maxRevenue > 0 ? (month.revenue / maxRevenue) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {monthlyRevenue.length > 0 && (
          <div className="mt-6 pt-6 border-t space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Total (12 months)</span>
              <span className="text-lg font-bold">
                ${monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Average per month</span>
              <span>
                $
                {(
                  monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0) / monthlyRevenue.length
                ).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
