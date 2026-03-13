'use client'

import { useTranslations } from 'next-intl'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface RevenueDataPoint {
  date: string
  revenue: number
  transactions: number
}

interface RevenueChartProps {
  data: RevenueDataPoint[]
  totalRevenue: number
  period: string
}

export function RevenueChart({ data, totalRevenue, period }: RevenueChartProps) {
  const t = useTranslations('dashboard.admin.analytics.revenue')
  const averageRevenue = data.length > 0 ? totalRevenue / data.length : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('description', { period })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">{t('total')}</p>
            <p className="text-2xl font-bold tracking-tight">
              ${totalRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('avg', { amount: averageRevenue.toFixed(2) })}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: any, name: any) => {
                  if (value === undefined || name === undefined) return ['N/A', 'Unknown']
                  if (name === 'revenue') return [`$${Number(value).toFixed(2)}`, t('tooltip')]
                  return [value, 'Transactions']
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revenueGradient)"
                name={t('tooltip')}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-muted-foreground">{t('noData')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
