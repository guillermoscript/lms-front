'use client'

import { useTranslations } from 'next-intl'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { IconTrophy, IconUsers } from '@tabler/icons-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface CoursePopularityData {
  courseId: number
  title: string
  enrollments: number
  completionRate: number
}

interface CoursePopularityChartProps {
  data: CoursePopularityData[]
}

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
]

export function CoursePopularityChart({ data }: CoursePopularityChartProps) {
  const t = useTranslations('dashboard.admin.analytics.coursePopularity')
  const topCourses = data.slice(0, 8) // Show top 8 courses

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconTrophy className="h-5 w-5 text-yellow-500" />
              {t('title')}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('description')}
            </p>
          </div>
          <Link href="/dashboard/admin/courses">
            <Button variant="ghost" size="sm">
              {t('viewAll')}
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {topCourses.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topCourses} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis
                  dataKey="title"
                  type="category"
                  width={150}
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
                  formatter={(value: number | undefined) => {
                    if (value === undefined) return 'N/A'
                    return [value, t('enrollmentsTooltip')]
                  }}
                />
                <Bar dataKey="enrollments" radius={[0, 4, 4, 0]}>
                  {topCourses.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Course Details Table */}
            <div className="mt-6 space-y-2">
              <h4 className="text-sm font-medium">{t('detailsTitle')}</h4>
              <div className="space-y-2">
                {topCourses.map((course, index) => (
                  <div
                    key={course.courseId}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div>
                        <p className="text-sm font-medium">{course.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('enrollmentsCount', { count: course.enrollments })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">
                        {course.completionRate.toFixed(0)}%
                      </p>
                      <p className="text-xs text-muted-foreground">{t('completionLabel')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-muted-foreground">{t('noData')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
