"use client"

import { IconFileText, IconCalendar } from "@tabler/icons-react"
import Link from "next/link"

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
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Tomorrow"
    if (diffDays < 7) return `in ${diffDays} days`
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <h2 className="text-xl font-bold text-foreground">Upcoming Exams</h2>
      
      {exams.length > 0 ? (
        <div className="space-y-3">
          {exams.slice(0, 3).map((exam) => (
            <div
              key={exam.exam_id}
              className="bg-muted/50 border border-border rounded-xl p-4 hover:bg-muted transition-colors"
            >
              <div className="flex gap-3">
                <div className="mt-1">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <IconFileText className="w-5 h-5 text-orange-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground line-clamp-1">
                    {exam.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(exam.exam_date)} • {formatTime(exam.exam_date)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <IconCalendar className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">No upcoming exams</p>
        </div>
      )}

      {exams.length > 0 && (
        <Link 
          href="/dashboard/student/exams"
          className="block text-center text-sm text-cyan-400 hover:text-cyan-300 font-medium pt-2"
        >
          VIEW SCHEDULE
        </Link>
      )}
    </div>
  )
}
