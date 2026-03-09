"use client"

import { useMemo } from "react"
import { IconFileText, IconCalendar } from "@tabler/icons-react"
import { useTranslations } from "next-intl"

interface Exam {
  exam_id: number
  title: string
  exam_date: string
  course?: {
    title: string
  }
}

interface UpcomingExamsProps {
  exams: Exam[]
}

export function UpcomingExams({ exams }: UpcomingExamsProps) {
  const t = useTranslations('upcomingExams')

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }), [])
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }), [])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return t('today')
    if (diffDays === 1) return t('tomorrow')
    if (diffDays < 7) return t('inDays', { days: diffDays })

    return dateFormatter.format(date)
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="font-bold text-sm">{t('title')}</h2>
      </div>

      <div className="p-2">
        {exams.length > 0 ? (
          <div className="space-y-1">
            {exams.slice(0, 3).map((exam) => (
              <div
                key={exam.exam_id}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 active:bg-accent/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <IconFileText className="w-4 h-4 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold truncate">
                    {exam.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(exam.exam_date)} · {timeFormatter.format(new Date(exam.exam_date))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
              <IconCalendar className="w-5 h-5 text-muted-foreground/40" />
            </div>
            <p className="text-xs text-muted-foreground">{t('noExams')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
