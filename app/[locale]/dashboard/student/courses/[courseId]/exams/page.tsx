import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import ExamCard from '@/components/exercises/exam-card'
import { IconCertificate, IconProgress } from '@tabler/icons-react'
import { Progress } from '@/components/ui/progress'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { requireCourseAccess } from '@/lib/services/course-access-guard'

interface ExamSubmissionScore {
  score?: number | null
  exam_scores?: { score?: number | null }[] | { score?: number | null } | null
}

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function ExamsPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = createAdminClient()
  const t = await getTranslations('exams.list')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  // Entitlement gate (#509) — this list exposes the course's exams along with
  // the student's own graded answers and feedback.
  await requireCourseAccess(supabase, userId, parseInt(courseId))

  // Consolidated query
  const { data: exams, error } = await supabase
    .from('exams')
    .select(`
        *,
        courses(*),
        exam_submissions (
            submission_id,
            student_id,
            submission_date,
            score,
            review_status,
            exam_answers (
                answer_id,
                question_id,
                answer_text,
                is_correct,
                feedback
            ),
            exam_scores (
                score_id,
                score
            )
        )
    `)
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .eq('tenant_id', tenantId)
    .eq('exam_submissions.student_id', userId)
    .order('sequence')

  if (error) {
    console.error('Error fetching exams:', error)
    notFound()
  }

  if (!exams || exams.length === 0) {
    // Check if course exists
    const { data: course } = await supabase
      .from('courses')
      .select('title')
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .single()
    if (!course) notFound()

    return (
      <PageShell variant="wide">
        <PageHeader
          back={{ href: `/dashboard/student/courses/${courseId}`, label: course.title }}
          title={t('title')}
          description={t('subtitle')}
        />
        <div className="flex flex-col items-center justify-center py-20 bg-muted/20 border border-dashed rounded-3xl">
          <IconCertificate className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold text-muted-foreground">{t('empty.title')}</h3>
          <p className="text-muted-foreground text-center max-w-xs mt-2">
            {t('empty.description')}
          </p>
        </div>
      </PageShell>
    )
  }

  const firstExam = exams[0]
  const courseData = firstExam?.courses
  const courseTitle = (Array.isArray(courseData) ? courseData[0]?.title : (courseData as { title?: string | null } | null | undefined)?.title) || 'Course'

  const completedExams = exams.filter(exam => {
    const subs = exam.exam_submissions
    const submission = Array.isArray(subs) ? subs[0] : (subs as ExamSubmissionScore | null | undefined)
    if (!submission) return false
    const score = submission.score ?? (Array.isArray(submission.exam_scores) ? submission.exam_scores[0]?.score : (submission.exam_scores as { score?: number | null } | null | undefined)?.score)
    return score !== undefined && score !== null
  }).length
  const totalExams = exams.length
  const progressPercent = (completedExams / totalExams) * 100

  return (
    <PageShell variant="wide">
      <PageHeader
        back={{ href: `/dashboard/student/courses/${courseId}`, label: courseTitle }}
        title={t('title')}
        description={t('subtitle')}
      />

      <div className="bg-card border rounded-2xl p-4 shadow-sm w-full sm:max-w-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <IconProgress size={16} />
            {t('progress')}
          </span>
          <span className="text-sm font-bold">{completedExams}/{totalExams}</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {exams.map((exam) => (
          <ExamCard
            key={exam.exam_id}
            exam={exam}
            courseId={courseId}
          />
        ))}
      </div>
    </PageShell>
  )
}
