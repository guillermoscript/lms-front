'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import Image from 'next/image'
import {
  IconPlayerPlay,
  IconRefresh,
  IconCheck,
  IconAlertTriangle,
  IconChevronRight,
  IconArrowRight,
  IconBook2,
  IconClock,
} from '@tabler/icons-react'
import { calculateCourseProgress, type ExamInfo, type ExamAttempt } from '@/lib/services/course-progress-service'
import { determineAccessStatus, getAccessBadge, shouldShowRenewCTA } from '@/lib/services/enrollment-service'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface EnrolledCourseCardProps {
  enrollment: any
  userId: string
}

export function EnrolledCourseCard({ enrollment, userId }: EnrolledCourseCardProps) {
  const t = useTranslations('components.enrolledCourse')
  const course = enrollment.course as any

  if (!course) return null

  // Calculate lesson progress
  const lessons = course.lessons || []
  const totalLessons = lessons.length
  const completedLessons = lessons.filter((lesson: any) => {
    const completions = lesson.lesson_completions || []
    return completions.some((c: any) => c.user_id === userId)
  }).length

  // Calculate exam progress
  const exams = course.exams || []
  const examsWithAttempts: ExamInfo[] = exams.map((exam: any) => {
    const submissions = exam.exam_submissions?.filter((s: any) => s.student_id === userId) || []
    const attempts: ExamAttempt[] = submissions.map((submission: any) => ({
      submissionId: submission.submission_id,
      score: submission.exam_scores?.[0]?.score || 0,
      submittedAt: new Date(submission.submitted_at),
    }))

    return {
      examId: exam.exam_id,
      title: exam.title,
      sequence: exam.sequence,
      passingScore: exam.passing_score,
      allowRetake: exam.allow_retake,
      attempts,
    }
  })

  const progress = calculateCourseProgress(totalLessons, completedLessons, examsWithAttempts)

  const accessStatus = determineAccessStatus({
    product_id: enrollment.product_id,
    subscription_id: enrollment.subscription_id,
    status: enrollment.status,
    subscription: enrollment.subscription,
    product: enrollment.product,
  })

  const accessBadge = getAccessBadge(accessStatus)
  const showRenew = shouldShowRenewCTA(accessStatus)

  // Find next incomplete lesson
  const nextLesson = lessons
    .sort((a: any, b: any) => a.sequence - b.sequence)
    .find((lesson: any) => {
      const completions = lesson.lesson_completions || []
      return !completions.some((c: any) => c.user_id === userId)
    })

  const enrolledDate = enrollment.enrollment_date
    ? formatDistanceToNow(new Date(enrollment.enrollment_date), { addSuffix: true })
    : null

  const isCompleted = progress.status === 'completed'
  const isInProgress = progress.status === 'in_progress'
  const pct = progress.overallPercentage

  return (
    <Link
      href={`/dashboard/student/courses/${course.course_id}`}
      className="block group"
      data-testid={`course-link-${course.course_id}`}
    >
      <div className={cn(
        "relative flex flex-col sm:flex-row overflow-hidden rounded-2xl border bg-card transition-all duration-200",
        "hover:shadow-lg hover:border-primary/20",
        !accessStatus.hasAccess && "opacity-75"
      )}>
        {/* Thumbnail */}
        <div className="relative w-full sm:w-48 md:w-56 shrink-0 aspect-[16/10] sm:aspect-auto overflow-hidden bg-muted">
          {course.thumbnail_url || course.image_url ? (
            <Image
              src={course.thumbnail_url || course.image_url}
              alt={course.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full min-h-[140px] flex items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
              <IconBook2 className="w-10 h-10 text-primary/30" />
            </div>
          )}

          {/* Progress overlay on thumbnail */}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
            <div
              className={cn(
                "h-full transition-all duration-500",
                isCompleted ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Status chip on thumbnail */}
          {isCompleted && (
            <div className="absolute top-2.5 left-2.5">
              <div className="flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-md">
                <IconCheck size={10} stroke={3} />
                {t('completed')}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col p-4 sm:p-5 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <h3
                data-testid={`course-title-${course.course_id}`}
                className="font-bold text-base leading-snug line-clamp-1 group-hover:text-primary transition-colors"
              >
                {course.title}
              </h3>
              {enrolledDate && (
                <p className="text-[11px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                  <IconClock size={10} />
                  {t('enrolled', { date: enrolledDate })}
                </p>
              )}
            </div>
            <Badge variant={accessBadge.variant as any} className="text-[10px] font-bold shrink-0 uppercase tracking-wider">
              {accessBadge.text}
            </Badge>
          </div>

          {/* Progress Section */}
          <div className="mt-auto space-y-2.5">
            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                <span className="font-bold text-foreground">{progress.lessonsCompleted}</span>/{progress.totalLessons} {t('lessons')}
              </span>
              {progress.totalExams > 0 && (
                <span className="text-muted-foreground">
                  <span className="font-bold text-foreground">{progress.examsPassed}</span>/{progress.totalExams} {t('exams')}
                </span>
              )}
              <span
                data-testid={`course-progress-${course.course_id}`}
                className={cn(
                  "ml-auto text-xs font-bold tabular-nums",
                  isCompleted ? "text-emerald-600" : isInProgress ? "text-primary" : "text-muted-foreground"
                )}
              >
                {pct}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isCompleted
                    ? "bg-emerald-500"
                    : isInProgress
                      ? "bg-primary"
                      : "bg-muted-foreground/20"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Next up / Expired / CTA */}
            {!accessStatus.hasAccess ? (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <IconAlertTriangle size={13} />
                <span className="font-medium">{t('expired')}</span>
              </div>
            ) : nextLesson && !isCompleted ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconPlayerPlay size={12} className="text-primary shrink-0" />
                <span className="truncate">{t('upNext')}: <span className="font-medium text-foreground">{nextLesson.title}</span></span>
              </div>
            ) : null}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-end mt-3 pt-3 border-t border-border/50">
            {showRenew ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <IconRefresh size={13} />
                {t('renew')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                {isCompleted ? t('review') : t('continue')}
                <IconArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
