import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import Link from 'next/link'
import {
  IconChartBar,
  IconBook,
  IconCheckbox,
  IconClipboardCheck,
  IconTrophy,
} from '@tabler/icons-react'

export default async function StudentProgressPage() {
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.student.progress')

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Fetch enrollments with course data
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(`
      enrollment_id,
      course_id,
      status,
      enrollment_date,
      courses (
        course_id,
        title,
        status
      )
    `)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('enrollment_date', { ascending: false })

  // Get all course IDs for enrolled courses
  const courseIds = enrollments?.map((e) => e.course_id) || []

  // Parallelize all 4 queries (all independent once we have courseIds and userId)
  const [{ data: lessons }, { data: completions }, { data: exams }, { data: examSubmissions }] = await Promise.all([
    courseIds.length > 0
      ? supabase.from('lessons').select('id, course_id, title').in('course_id', courseIds).eq('status', 'published')
      : Promise.resolve({ data: [] as { id: number; course_id: number; title: string }[] }),
    supabase.from('lesson_completions').select('lesson_id, completed_at').eq('user_id', userId),
    courseIds.length > 0
      ? supabase.from('exams').select('exam_id, course_id, title, passing_score').in('course_id', courseIds)
      : Promise.resolve({ data: [] as { exam_id: number; course_id: number; title: string; passing_score: number }[] }),
    supabase.from('exam_submissions').select('exam_id, score, submission_date')
      .eq('student_id', userId).eq('tenant_id', tenantId),
  ])

  // Build maps
  const completionSet = new Set(completions?.map((c) => c.lesson_id) || [])
  const examScoreMap = new Map<number, number>()
  examSubmissions?.forEach((s) => {
    const existing = examScoreMap.get(s.exam_id)
    if (!existing || (s.score && s.score > existing)) {
      examScoreMap.set(s.exam_id, s.score || 0)
    }
  })

  // Calculate per-course progress
  const courseProgress = (enrollments || []).map((enrollment) => {
    const course = enrollment.courses as any
    const courseLessons = (lessons || []).filter((l) => l.course_id === enrollment.course_id)
    const courseExams = (exams || []).filter((e) => e.course_id === enrollment.course_id)
    const completedLessons = courseLessons.filter((l) => completionSet.has(l.id))
    const completedExams = courseExams.filter((e) => examScoreMap.has(e.exam_id))

    const totalItems = courseLessons.length + courseExams.length
    const completedItems = completedLessons.length + completedExams.length
    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

    return {
      enrollmentId: enrollment.enrollment_id,
      courseId: enrollment.course_id,
      courseTitle: course?.title || 'Unknown Course',
      status: enrollment.status,
      enrollmentDate: enrollment.enrollment_date,
      totalLessons: courseLessons.length,
      completedLessons: completedLessons.length,
      totalExams: courseExams.length,
      completedExams: completedExams.length,
      percentage,
      examScores: courseExams.map((e) => ({
        title: e.title,
        score: examScoreMap.get(e.exam_id),
        passingScore: e.passing_score,
      })),
    }
  })

  // Overall stats
  const totalLessonsCompleted = completions?.length || 0
  const totalExamsCompleted = examSubmissions
    ? new Set(examSubmissions.map((s) => s.exam_id)).size
    : 0
  const avgScore =
    examSubmissions && examSubmissions.length > 0
      ? Math.round(
          examSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) /
            examSubmissions.length
        )
      : 0

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl" data-testid="progress-page">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <IconChartBar className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight" data-testid="progress-title">
            {t('title')}
          </h1>
        </div>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {!enrollments || enrollments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-muted p-4 rounded-full">
                <IconChartBar className="w-8 h-8 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">{t('noEnrollments')}</h3>
            <p className="text-muted-foreground mb-6">{t('noEnrollmentsDescription')}</p>
            <Link href="/dashboard/student/browse">
              <Button>{t('browseCourses')}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overall Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('coursesEnrolled')}</p>
                    <p className="mt-2 text-3xl font-bold">{enrollments.length}</p>
                  </div>
                  <IconBook className="h-10 w-10 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('lessonsCompleted')}</p>
                    <p className="mt-2 text-3xl font-bold">{totalLessonsCompleted}</p>
                  </div>
                  <IconCheckbox className="h-10 w-10 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('examsCompleted')}</p>
                    <p className="mt-2 text-3xl font-bold">{totalExamsCompleted}</p>
                  </div>
                  <IconClipboardCheck className="h-10 w-10 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('avgScore')}</p>
                    <p className="mt-2 text-3xl font-bold">{avgScore > 0 ? `${avgScore}%` : '—'}</p>
                  </div>
                  <IconTrophy className="h-10 w-10 text-amber-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Per-Course Progress */}
          <Card>
            <CardHeader>
              <CardTitle>{t('courseProgress')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {courseProgress.map((course) => (
                <div
                  key={course.enrollmentId}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{course.courseTitle}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {t('lessons', {
                            completed: course.completedLessons,
                            total: course.totalLessons,
                          })}
                        </span>
                        {course.totalExams > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {t('exams', {
                              completed: course.completedExams,
                              total: course.totalExams,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          course.percentage === 100
                            ? 'default'
                            : course.percentage > 0
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {course.percentage === 100
                          ? t('completed')
                          : course.percentage > 0
                            ? t('inProgress')
                            : t('notStarted')}
                      </Badge>
                      <Link href={`/dashboard/student/courses/${course.courseId}`}>
                        <Button variant="ghost" size="sm">
                          {t('viewCourse')}
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Progress value={course.percentage} className="flex-1" />
                    <span className="text-sm font-medium w-12 text-right">
                      {course.percentage}%
                    </span>
                  </div>

                  {/* Exam scores */}
                  {course.examScores.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {course.examScores.map((exam, idx) => (
                        <Badge
                          key={idx}
                          variant={
                            exam.score !== undefined
                              ? exam.score >= (exam.passingScore || 70)
                                ? 'default'
                                : 'destructive'
                              : 'outline'
                          }
                          className="text-xs"
                        >
                          {exam.title}
                          {exam.score !== undefined
                            ? ` — ${t('examScore', { score: Math.round(exam.score) })}`
                            : ''}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
