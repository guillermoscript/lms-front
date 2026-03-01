import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'
import { ExamSubmissionsReview } from '@/components/teacher/exam-submissions-review'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function SubmissionsPage({ params }: { params: Promise<{ courseId: string; examId: string }> }) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { courseId, examId } = await params

  // Fetch exam details
  const { data: exam } = await supabase
    .from('exams')
    .select('*')
    .eq('exam_id', examId)
    .eq('tenant_id', tenantId)
    .single()

  if (!exam) return notFound()

  // Fetch submissions with scores
  const { data: rawSubmissions } = await supabase
    .from('exam_submissions')
    .select('*')
    .eq('exam_id', parseInt(examId))
    .eq('tenant_id', tenantId)
    .order('submission_date', { ascending: false })

  if (!rawSubmissions) return notFound()

  // Fetch student profiles
  const studentIds = rawSubmissions.map(s => s.student_id)
  const { data: students } = studentIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', studentIds)
    : { data: [] }

  // Transform submissions to match component interface
  const submissions = rawSubmissions.map(submission => {
    const student = students?.find(s => s.id === submission.student_id)
    const reviewStatus = submission.review_status || 'pending'
    const requiresAttention = submission.requires_attention
      || reviewStatus === 'pending_teacher_review'
      || (submission.ai_confidence_score != null && submission.ai_confidence_score < 0.7)

    return {
      id: submission.submission_id,
      student_id: submission.student_id,
      student_name: student?.full_name || 'Unknown Student',
      submitted_at: submission.submission_date,
      score: submission.score || 0,
      review_status: reviewStatus as 'pending' | 'pending_teacher_review' | 'ai_reviewed' | 'teacher_reviewed',
      requires_attention: requiresAttention,
      ai_model_used: submission.ai_model_used || undefined,
      ai_processing_time_ms: submission.ai_processing_time_ms || undefined,
    }
  })

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Link href={`/dashboard/teacher/courses/${courseId}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back to Course
        </Button>
      </Link>

      <ExamSubmissionsReview
        examId={parseInt(examId)}
        examTitle={exam.title}
        courseId={parseInt(courseId)}
        submissions={submissions}
      />
    </div>
  )
}
