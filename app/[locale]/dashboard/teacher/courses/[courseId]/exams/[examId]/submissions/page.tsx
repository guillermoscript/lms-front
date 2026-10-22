import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { ExamSubmissionsReview } from '@/components/teacher/exam-submissions-review'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export default async function SubmissionsPage({ params }: { params: Promise<{ courseId: string; examId: string }> }) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.teacher')
  const userId = await getCurrentUserId()
  if (!userId) return notFound()

  const { courseId, examId } = await params

  // Fetch exam details
  const { data: exam } = await supabase
    .from('exams')
    .select('*')
    .eq('exam_id', examId)
    .eq('tenant_id', tenantId)
    .single()

  if (!exam) return notFound()

  // Fetch ALL submissions (PostgREST caps a plain read at 1000 rows; the stat
  // cards are computed over this set). Count-verified, stable PK order.
  const rawSubmissions = await fetchAllRows('exam_submissions', (from, to) =>
    supabase
      .from('exam_submissions')
      .select('*', { count: 'exact' })
      .eq('exam_id', parseInt(examId))
      .eq('tenant_id', tenantId)
      .order('submission_date', { ascending: false })
      .order('submission_id', { ascending: false })
      .range(from, to)
  )

  // Fetch student profiles (chunked: a long .in() list overflows the URL limit)
  const studentIds = rawSubmissions.map(s => s.student_id).filter(Boolean)
  const students = await fetchAllRowsIn('profiles', studentIds, (chunk, from, to) =>
    supabase
      .from('profiles')
      .select('id, full_name', { count: 'exact' })
      .in('id', chunk)
      .order('id')
      .range(from, to)
  )

  // Transform submissions to match component interface
  const submissions = rawSubmissions.map(submission => {
    const student = students.find(s => s.id === submission.student_id)
    const reviewStatus = submission.review_status || 'pending'
    const requiresAttention = submission.requires_attention
      || reviewStatus === 'pending_teacher_review'
      || (submission.ai_confidence_score != null && submission.ai_confidence_score < 0.7)

    // NOTE: field names below must match what ExamSubmissionsReview reads
    // (profiles.full_name, status, ai_score, final_score). They had drifted
    // (student_name / review_status / score), which rendered every row as
    // "Unknown Student" with "undefined%" scores and zeroed every stat card.
    return {
      id: submission.submission_id,
      student_id: submission.student_id,
      profiles: {
        full_name: student?.full_name || null,
      },
      status: reviewStatus,
      submitted_at: submission.submission_date,
      // DB has a single `score` column; AI grade and final score are the same
      // until a teacher override updates `score`.
      ai_score: submission.score ?? null,
      final_score: submission.score ?? null,
      requires_attention: requiresAttention,
      ai_model_used: submission.ai_model_used || undefined,
      ai_processing_time_ms: submission.ai_processing_time_ms || undefined,
    }
  })

  return (
    <PageShell variant="wide">
      <PageHeader
        back={{ href: `/dashboard/teacher/courses/${courseId}`, label: t('manageCourse.backToCourses') }}
        title={t('manageCourse.assessments.submissions')}
        description={exam.title}
      />

      <ExamSubmissionsReview
        examId={parseInt(examId)}
        examTitle={exam.title}
        courseId={parseInt(courseId)}
        submissions={submissions}
      />
    </PageShell>
  )
}
