"use client"

import { IconCircleCheck, IconFileText } from "@tabler/icons-react"

interface ExamSubmission {
  submission_id: number
  exam_id: number
  score: number | null
  submitted_at: string
}

interface RecentActivityProps {
  submissions: ExamSubmission[]
}

export function RecentActivity({ submissions }: RecentActivityProps) {
  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60))
    
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffTime / (1000 * 60))
      return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`
    }
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
    
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <h2 className="text-xl font-bold text-foreground">Recent Activity</h2>
      
      {submissions.length > 0 ? (
        <div className="space-y-3">
          {submissions.slice(0, 4).map((submission) => (
            <div
              key={submission.submission_id}
              className="flex gap-3 py-2"
            >
              <div className="mt-1">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <IconCircleCheck className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">
                  Assignment Graded
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {submission.score !== null 
                    ? `Score: ${submission.score}/100` 
                    : 'Pending grade'}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  {getTimeAgo(submission.submitted_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <IconFileText className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">No recent activity</p>
        </div>
      )}
    </div>
  )
}
