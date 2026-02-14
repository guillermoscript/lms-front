'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { IconUsers, IconUserPlus } from '@tabler/icons-react'

interface UserGrowthDataPoint {
  date: string
  newUsers: number
  totalUsers: number
}

interface UserGrowthChartProps {
  data: UserGrowthDataPoint[]
  totalUsers: number
  period: string
}

export function UserGrowthChart({ data, totalUsers, period }: UserGrowthChartProps) {
  const newUsersInPeriod = data.reduce((sum, d) => sum + d.newUsers, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconUserPlus className="h-5 w-5 text-blue-500" />
              User Growth
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              User registration trends for the {period}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Users</p>
            <p className="text-2xl font-bold text-blue-600">{totalUsers}</p>
            <p className="text-xs text-muted-foreground">
              +{newUsersInPeriod} new in period
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="newUsers"
                stroke="#3b82f6"
                strokeWidth={2}
                name="New Users"
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="totalUsers"
                stroke="#10b981"
                strokeWidth={2}
                name="Total Users"
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-muted-foreground">No user growth data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
