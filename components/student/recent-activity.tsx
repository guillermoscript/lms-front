"use client"

import { useMemo } from "react"
import { IconCircleCheck, IconFileText } from "@tabler/icons-react"
import { useTranslations } from "next-intl"

interface ExamSubmission {
  submission_id: number
  exam_id: number
  score: number | null
  submission_date: string
}

interface RecentActivityProps {
  submissions: ExamSubmission[]
}

export function RecentActivity({ submissions }: RecentActivityProps) {
  const t = useTranslations('recentActivity')

  const relativeFormatter = useMemo(() => new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }), [])
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }), [])

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 60) return relativeFormatter.format(-diffMinutes, 'minute')
    if (diffHours < 24) return relativeFormatter.format(-diffHours, 'hour')
    if (diffDays < 7) return relativeFormatter.format(-diffDays, 'day')

    return dateFormatter.format(date)
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="font-bold text-sm">{t('title')}</h2>
      </div>

      <div className="p-2">
        {submissions.length > 0 ? (
          <div className="space-y-1">
            {submissions.slice(0, 4).map((submission) => (
              <div
                key={submission.submission_id}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <IconCircleCheck className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold truncate">
                    {t('assignmentGraded')}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {submission.score !== null
                      ? t('score', { score: submission.score })
                      : t('pendingGrade')}
                    {' · '}
                    {getTimeAgo(submission.submission_date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
              <IconFileText className="w-5 h-5 text-muted-foreground/40" />
            </div>
            <p className="text-xs text-muted-foreground">{t('noActivity')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
