'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useMemo } from 'react'
import { IconChartBar } from '@tabler/icons-react'

interface Transaction {
  amount: string
  created_at: string
}

interface RevenueChartProps {
  transactions: Transaction[]
}

export function RevenueChart({ transactions }: RevenueChartProps) {
  const t = useTranslations('dashboard.teacher.revenue.chart')

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
        label: new Date(month + '-01').toLocaleDateString(undefined, {
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
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('empty')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <IconChartBar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {t('emptyDescription')}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {monthlyRevenue.map((month) => (
            <div key={month.month} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{month.label}</span>
                <span className="text-muted-foreground tabular-nums">${month.revenue.toFixed(2)}</span>
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
              <span className="font-medium">{t('total')}</span>
              <span className="text-lg font-bold tabular-nums">
                ${monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t('average')}</span>
              <span className="tabular-nums">
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
