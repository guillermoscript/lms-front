import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { SubmissionReview } from '@/components/teacher/submission-review'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'
import { revalidatePath } from 'next/cache'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function SubmissionDetailPage({ params }: { params: Promise<{ courseId: string; examId: string; submissionId: string }> }) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { courseId, examId, submissionId } = await params

  // Fetch submission with student info
  const { data: rawSubmission } = await supabase
    .from('exam_submissions')
    .select('*')
    .eq('submission_id', submissionId)
    .eq('tenant_id', tenantId)
    .single()

  if (!rawSubmission) return notFound()

  // Fetch student profile
  const { data: student } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', rawSubmission.student_id)
    .single()

  // Fetch exam questions with options
  const { data: questions } = await supabase
    .from('exam_questions')
    .select(`
      question_id,
      question_text,
      question_type,
      points,
      ai_grading_criteria,
      expected_keywords,
      question_options (
        option_id,
        option_text,
        is_correct
      )
    `)
    .eq('exam_id', parseInt(examId))
    .eq('tenant_id', tenantId)
    .order('question_id', { ascending: true })

  // Fetch answers
  const { data: answers } = await supabase
    .from('exam_answers')
    .select('*')
    .eq('submission_id', parseInt(submissionId))
    .eq('tenant_id', tenantId)

  // Fetch question-level AI scores
  const { data: questionScores } = await supabase
    .from('exam_question_scores')
    .select('*')
    .eq('submission_id', parseInt(submissionId))
    .eq('tenant_id', tenantId)

  // Fetch overall exam_scores
  const { data: examScores } = await supabase
    .from('exam_scores')
    .select('*')
    .eq('submission_id', parseInt(submissionId))
    .eq('tenant_id', tenantId)

  // Build per-question data combining questions, answers, and AI scores
  const questionData = (questions || []).map((q: any) => {
    const answer = answers?.find(a => a.question_id === q.question_id)
    const qScore = questionScores?.find(qs => qs.question_id === q.question_id)

    return {
      question_id: q.question_id,
      question_text: q.question_text,
      question_type: q.question_type,
      points_possible: q.points || 10,
      ai_grading_criteria: q.ai_grading_criteria,
      expected_keywords: q.expected_keywords,
      options: q.question_options || [],
      // Answer
      answer_text: answer?.answer_text || '',
      answer_is_correct: answer?.is_correct,
      answer_feedback: answer?.feedback,
      // AI/Teacher scoring
      score_id: qScore?.score_id,
      points_earned: qScore?.points_earned ?? null,
      is_correct: qScore?.is_correct ?? answer?.is_correct ?? null,
      ai_feedback: qScore?.ai_feedback || '',
      ai_confidence: qScore?.ai_confidence ?? null,
      teacher_notes: qScore?.teacher_notes || '',
      is_overridden: qScore?.is_overridden || false,
    }
  })

  const submission = {
    submission_id: rawSubmission.submission_id,
    exam_id: rawSubmission.exam_id,
    student_id: rawSubmission.student_id,
    student_name: student?.full_name || 'Unknown Student',
    submission_date: rawSubmission.submission_date,
    score: rawSubmission.score,
    review_status: rawSubmission.review_status || 'pending',
    ai_data: rawSubmission.ai_data,
    ai_model_used: rawSubmission.ai_model_used,
    overall_feedback: examScores?.[0]?.feedback || (rawSubmission.ai_data as any)?.overall_feedback || '',
    teacher_notes: examScores?.[0]?.teacher_notes || '',
    questions: questionData,
  }

  const handleSave = async (overrides: {
    score: number
    feedback: string
    teacher_notes: string
    question_overrides: {
      question_id: number
      points_earned: number
      is_correct: boolean
      teacher_notes: string
    }[]
  }) => {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Update individual question scores
    for (const qo of overrides.question_overrides) {
      await supabase
        .from('exam_question_scores')
        .upsert({
          submission_id: parseInt(submissionId),
          question_id: qo.question_id,
          points_earned: qo.points_earned,
          points_possible: questionData.find(q => q.question_id === qo.question_id)?.points_possible || 10,
          is_correct: qo.is_correct,
          teacher_id: user.id,
          teacher_notes: qo.teacher_notes,
          is_overridden: true,
          reviewed_at: new Date().toISOString(),
        }, { onConflict: 'submission_id,question_id' })
    }

    // Update overall exam_scores
    await supabase
      .from('exam_scores')
      .upsert({
        submission_id: parseInt(submissionId),
        student_id: rawSubmission.student_id,
        exam_id: rawSubmission.exam_id,
        score: overrides.score,
        feedback: overrides.feedback,
        teacher_id: user.id,
        teacher_notes: overrides.teacher_notes,
        is_overridden: true,
        reviewed_at: new Date().toISOString(),
      }, { onConflict: 'submission_id,student_id,exam_id' })

    // Update submission score and review_status
    await supabase
      .from('exam_submissions')
      .update({
        score: overrides.score,
        review_status: 'teacher_reviewed',
        requires_attention: false,
      })
      .eq('submission_id', parseInt(submissionId))

    revalidatePath(`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`)
    redirect(`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`)
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Link href={`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back to Submissions
        </Button>
      </Link>

      <SubmissionReview submission={submission} onSave={handleSave} />
    </div>
  )
}
