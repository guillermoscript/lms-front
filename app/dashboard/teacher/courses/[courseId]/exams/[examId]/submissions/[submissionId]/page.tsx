import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { SubmissionReview } from '@/components/teacher/submission-review'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'

export default async function SubmissionDetailPage({ params }: { params: Promise<{ courseId: string; examId: string; submissionId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { courseId, examId, submissionId } = await params

  // Fetch submission
  const { data: rawSubmission } = await supabase
    .from('exam_submissions')
    .select('*')
    .eq('submission_id', submissionId)
    .single()

  if (!rawSubmission) return notFound()

  // Fetch student profile
  const { data: student } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', rawSubmission.student_id)
    .single()

  // Fetch answers with questions
  const { data: answers } = await supabase
    .from('exam_answers')
    .select(`
      *,
      question:exam_questions(*)
    `)
    .eq('submission_id', submissionId)

  // Fetch score
  const { data: score } = await supabase
    .from('exam_scores')
    .select('*')
    .eq('submission_id', submissionId)

  // Combine the data
  const submission = {
    ...rawSubmission,
    student,
    answers: answers || [],
    score: score || []
  }

  const handleSave = async (overrides: any) => {
    'use server'
    const supabase = await createClient()

    // Update exam scores with teacher override
    // First get the existing score to get student_id and exam_id
    const { data: existingScore } = await supabase
      .from('exam_scores')
      .select('student_id, exam_id')
      .eq('submission_id', parseInt(submissionId))
      .single()

    const { error: scoreError } = await supabase
      .from('exam_scores')
      .upsert({
        submission_id: parseInt(submissionId),
        student_id: existingScore?.student_id || rawSubmission.student_id,
        exam_id: existingScore?.exam_id || rawSubmission.exam_id,
        score: overrides.score,
        feedback: overrides.feedback,
        teacher_id: (await supabase.auth.getUser()).data.user?.id,
        teacher_notes: overrides.teacher_notes,
        is_overridden: true,
        reviewed_at: new Date().toISOString()
      }, { onConflict: 'submission_id,student_id,exam_id' })

    if (scoreError) {
      console.error('Error saving score override:', scoreError)
      return
    }

    // Update submission review status
    await supabase
      .from('exam_submissions')
      .update({ review_status: 'teacher_reviewed' })
      .eq('submission_id', submissionId)

    // Update individual question overrides if provided
    if (overrides.question_overrides && overrides.question_overrides.length > 0) {
      for (const q of overrides.question_overrides) {
        await supabase
          .from('exam_answers')
          .update({
            is_correct: q.is_correct,
            feedback: q.feedback
          })
          .eq('submission_id', submissionId)
          .eq('question_id', q.question_id)
      }
    }

    redirect(`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`)
  }

  return (
    <div className="container mx-auto py-8">
      <Link href={`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back to Submissions
        </Button>
      </Link>

      <h1 className="text-3xl font-bold mb-2">Review Submission</h1>
      <p className="text-muted-foreground mb-6">Student: {submission.student?.full_name || 'Unknown'}</p>

      <SubmissionReview submission={submission} onSave={handleSave} />
    </div>
  )
}
