'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  IconCertificate,
  IconTrendingUp,
  IconUsers,
  IconCheckbox,
} from '@tabler/icons-react'

interface EngagementMetricsProps {
  totalEnrollments: number
  activeStudents: number
  averageCompletionRate: number
  totalLessonCompletions: number
  totalExamSubmissions: number
}

export function EngagementMetrics({
  totalEnrollments,
  activeStudents,
  averageCompletionRate,
  totalLessonCompletions,
  totalExamSubmissions,
}: EngagementMetricsProps) {
  const metrics = [
    {
      title: 'Total Enrollments',
      value: totalEnrollments,
      icon: IconCertificate,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: 'Active Students',
      value: activeStudents,
      subtitle: 'Last 30 days',
      icon: IconUsers,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Lesson Completions',
      value: totalLessonCompletions,
      icon: IconCheckbox,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Exam Submissions',
      value: totalExamSubmissions,
      icon: IconTrendingUp,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engagement Metrics</CardTitle>
        <p className="text-sm text-muted-foreground">
          Platform engagement and activity statistics
        </p>
      </CardHeader>
      <CardContent>
        {/* Completion Rate */}
        <div className="mb-6 rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              Average Course Completion Rate
            </span>
            <span className="text-2xl font-bold text-green-600">
              {averageCompletionRate.toFixed(1)}%
            </span>
          </div>
          <Progress value={averageCompletionRate} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Based on lesson completions across all enrolled courses
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div
              key={metric.title}
              className="flex items-center gap-4 rounded-lg border p-4"
            >
              <div className={`rounded-lg p-3 ${metric.bgColor}`}>
                <metric.icon className={`h-6 w-6 ${metric.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{metric.title}</p>
                <p className="text-2xl font-bold">{metric.value}</p>
                {metric.subtitle && (
                  <p className="text-xs text-muted-foreground">{metric.subtitle}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
