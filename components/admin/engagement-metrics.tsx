'use client'

import { useTranslations } from 'next-intl'

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
  const t = useTranslations('dashboard.admin.analytics.engagement')
  const metrics = [
    {
      title: t('metrics.enrollments'),
      value: totalEnrollments,
      icon: IconCertificate,
    },
    {
      title: t('metrics.activeStudents'),
      value: activeStudents,
      subtitle: t('metrics.activePeriod'),
      icon: IconUsers,
    },
    {
      title: t('metrics.lessonCompletions'),
      value: totalLessonCompletions,
      icon: IconCheckbox,
    },
    {
      title: t('metrics.examSubmissions'),
      value: totalExamSubmissions,
      icon: IconTrendingUp,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
      </CardHeader>
      <CardContent>
        {/* Completion Rate */}
        <div className="mb-6 rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              {t('completionRate')}
            </span>
            <span className="text-2xl font-bold tracking-tight">
              {averageCompletionRate.toFixed(1)}%
            </span>
          </div>
          <Progress value={averageCompletionRate} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {t('completionRateDesc')}
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.title} className="rounded-lg border p-4">
              <metric.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="mt-3 text-2xl font-bold tracking-tight">{metric.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{metric.title}</p>
              {metric.subtitle && (
                <p className="text-[11px] text-muted-foreground/60">{metric.subtitle}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
