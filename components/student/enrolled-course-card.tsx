'use client'

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import Link from 'next/link'
import Image from 'next/image'
import { 
  IconClock, 
  IconCalendar, 
  IconTrophy, 
  IconRefresh,
  IconCheck,
  IconAlertCircle
} from '@tabler/icons-react'
import { calculateCourseProgress, type ExamInfo, type ExamAttempt } from '@/lib/services/course-progress-service'
import { determineAccessStatus, getAccessBadge, shouldShowRenewCTA } from '@/lib/services/enrollment-service'
import { formatDistanceToNow } from 'date-fns'

interface EnrolledCourseCardProps {
  enrollment: any
  userId: string
}

export function EnrolledCourseCard({ enrollment, userId }: EnrolledCourseCardProps) {
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

  // Calculate overall progress
  const progress = calculateCourseProgress(totalLessons, completedLessons, examsWithAttempts)

  // Determine access status
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

  // Find next pending exam
  const nextExam = examsWithAttempts
    .sort((a, b) => a.sequence - b.sequence)
    .find(exam => exam.attempts.length === 0 || 
      (exam.allowRetake && exam.attempts.every(a => a.score < exam.passingScore)))

  // Enrollment date
  const enrolledDate = enrollment.enrollment_date 
    ? formatDistanceToNow(new Date(enrollment.enrollment_date), { addSuffix: true })
    : null

  // Status badge
  const getStatusBadge = () => {
    if (progress.status === 'completed') {
      return <Badge className="gap-1"><IconCheck className="w-3 h-3" /> Completed</Badge>
    }
    if (progress.status === 'in_progress') {
      return <Badge variant="secondary" className="gap-1">In Progress</Badge>
    }
    return <Badge variant="outline" className="gap-1">Not Started</Badge>
  }

  return (
    <Card className="flex flex-col overflow-hidden hover:shadow-lg transition-shadow">
      {/* Thumbnail */}
      <Link href={`/dashboard/student/courses/${course.course_id}`}>
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {course.thumbnail_url || course.image_url ? (
            <Image
              src={course.thumbnail_url || course.image_url}
              alt={course.title}
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <IconTrophy className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
        </div>
      </Link>

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          {getStatusBadge()}
          <Badge variant={accessBadge.variant as any} className="text-xs">
            {accessBadge.text}
          </Badge>
        </div>
        <Link href={`/dashboard/student/courses/${course.course_id}`}>
          <h3 className="font-semibold text-lg line-clamp-2 hover:text-primary transition-colors">
            {course.title}
          </h3>
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pb-3 space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-semibold">{progress.overallPercentage}%</span>
          </div>
          <Progress value={progress.overallPercentage} className="h-2" />
          
          {/* Lessons & Exams breakdown */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Lessons: {progress.lessonsCompleted}/{progress.totalLessons}
            </span>
            {progress.totalExams > 0 && (
              <span>
                Exams: {progress.examsPassed}/{progress.totalExams}
              </span>
            )}
          </div>
        </div>

        {/* Next item */}
        {(nextLesson || nextExam) && accessStatus.hasAccess && (
          <div className="text-sm space-y-1">
            <p className="text-muted-foreground font-medium">Up Next:</p>
            {nextLesson && (
              <p className="text-sm truncate">📚 {nextLesson.title}</p>
            )}
            {nextExam && !nextLesson && (
              <p className="text-sm truncate">📝 {nextExam.title}</p>
            )}
          </div>
        )}

        {/* Enrollment date */}
        {enrolledDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconCalendar className="w-3 h-3" />
            <span>Enrolled {enrolledDate}</span>
          </div>
        )}

        {/* Expired warning */}
        {!accessStatus.hasAccess && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
            <IconAlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Your subscription has expired. Renew to continue learning.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 border-t">
        {showRenew ? (
          <Link href="/pricing" className="w-full">
            <Button variant="outline" className="w-full gap-2">
              <IconRefresh className="w-4 h-4" />
              Renew Subscription
            </Button>
          </Link>
        ) : (
          <Link href={`/dashboard/student/courses/${course.course_id}`} className="w-full">
            <Button className="w-full">
              {progress.status === 'completed' ? 'Review Course' : 'Continue Learning'}
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  )
}
