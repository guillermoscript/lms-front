import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { SubmissionReview } from '@/components/teacher/submission-review'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import { revalidatePath } from 'next/cache'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export default async function SubmissionDetailPage({ params }: { params: Promise<{ courseId: string; examId: string; submissionId: string }> }) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.teacher')
  const userId = await getCurrentUserId()
  if (!userId) return notFound()

  const { courseId, examId, submissionId } = await params

  // Fetch submission with student info
  const { data: rawSubmission } = await supabase
    .from('exam_submissions')
    .select('*')
    .eq('submission_id', submissionId)
    .eq('tenant_id', tenantId)
    .single()

  if (!rawSubmission) return notFound()

  // Fetch all related data in parallel
  const [{ data: student }, { data: questions }, { data: answers }, { data: questionScores }, { data: examScores }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', rawSubmission.student_id)
      .single(),
    supabase
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
      // exam_questions has no tenant_id column; isolation is enforced by RLS
      // via the parent exam (already validated above).
      .order('question_id', { ascending: true }),
    supabase
      .from('exam_answers')
      .select('*')
      .eq('submission_id', parseInt(submissionId)),
    supabase
      .from('exam_question_scores')
      .select('*')
      .eq('submission_id', parseInt(submissionId)),
    supabase
      .from('exam_scores')
      .select('*')
      .eq('submission_id', parseInt(submissionId)),
  ])

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

  // Field names here must match what SubmissionReview reads on `submission`
  // (status, submitted_at, ai_score, final_score, teacher_feedback). They had
  // drifted (review_status / submission_date / score), so the header showed
  // "undefined%" scores and "Invalid Date".
  const aiScore = rawSubmission.score ?? null
  const finalScore = examScores?.[0]?.score ?? rawSubmission.score ?? null
  const submission = {
    submission_id: rawSubmission.submission_id,
    exam_id: rawSubmission.exam_id,
    student_id: rawSubmission.student_id,
    student_name: student?.full_name || t('manageCourse.studentList.unknownStudent'),
    status: rawSubmission.review_status || 'pending',
    submitted_at: rawSubmission.submission_date,
    ai_score: aiScore,
    final_score: finalScore,
    teacher_feedback: examScores?.[0]?.feedback || rawSubmission.feedback || (rawSubmission.ai_data as any)?.overall_feedback || '',
    ai_data: rawSubmission.ai_data,
    ai_model_used: rawSubmission.ai_model_used,
  }

  // SubmissionReview reads `questions` and `answers` as their own props (not
  // nested under submission). It keys overrides by question id, so `id` must
  // equal the answer's question_id. exam_questions has no `sequence` column,
  // so fall back to question_id for ordering.
  const questionsForReview = questionData.map(q => ({
    id: q.question_id,
    sequence: q.question_id,
    question_type: q.question_type,
    question_text: q.question_text,
    points_possible: q.points_possible,
    answer_text: q.answer_text,
    options: (q.options || []).map((o: any) => ({
      id: o.option_id,
      option_text: o.option_text,
      is_correct: o.is_correct,
    })),
  }))

  const answersForReview = questionData.map(q => ({
    question_id: q.question_id,
    points_earned: q.points_earned,
    is_correct: q.is_correct,
    teacher_notes: q.teacher_notes,
    teacher_score_override: q.is_overridden ? q.points_earned : null,
  }))

  // SubmissionReview calls onSave(overrides) where `overrides` is keyed by
  // question id — NOT the { score, question_overrides[] } shape this previously
  // expected, so the override never persisted. Consume the real shape, recompute
  // the overall score from the per-question points, and persist.
  const handleSave = async (overrides: Record<number, {
    points_earned?: number
    is_correct?: boolean
    teacher_notes?: string
    is_overridden?: boolean
  }>) => {
    'use server'
    const supabase = createAdminClient()
    const userId = await getCurrentUserId()
    if (!userId) return

    let totalEarned = 0
    let totalPossible = 0

    // Upsert individual question scores
    for (const [questionIdStr, data] of Object.entries(overrides)) {
      const questionId = parseInt(questionIdStr)
      const pointsPossible = questionData.find(q => q.question_id === questionId)?.points_possible || 10
      const pointsEarned = data.points_earned ?? 0
      totalEarned += pointsEarned
      totalPossible += pointsPossible

      await supabase
        .from('exam_question_scores')
        .upsert({
          submission_id: parseInt(submissionId),
          question_id: questionId,
          points_earned: pointsEarned,
          points_possible: pointsPossible,
          is_correct: data.is_correct ?? null,
          teacher_id: userId,
          teacher_notes: data.teacher_notes || null,
          is_overridden: data.is_overridden || false,
          reviewed_at: new Date().toISOString(),
        }, { onConflict: 'submission_id,question_id' })
    }

    const newScore = totalPossible > 0
      ? Math.round((totalEarned / totalPossible) * 100)
      : (rawSubmission.score ?? 0)

    // Update overall exam_scores
    await supabase
      .from('exam_scores')
      .upsert({
        submission_id: parseInt(submissionId),
        student_id: rawSubmission.student_id,
        exam_id: rawSubmission.exam_id,
        score: newScore,
        teacher_id: userId,
        is_overridden: true,
        reviewed_at: new Date().toISOString(),
      }, { onConflict: 'submission_id,student_id,exam_id' })

    // Update submission score and review_status
    await supabase
      .from('exam_submissions')
      .update({
        score: newScore,
        review_status: 'teacher_reviewed',
        requires_attention: false,
      })
      .eq('submission_id', parseInt(submissionId))

    revalidatePath(`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`)
    redirect(`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('submissions.backToSubmissions')}>
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {submission.student_name}
          </span>
        </div>
      </div>

      <SubmissionReview
        submission={submission}
        questions={questionsForReview}
        answers={answersForReview}
        onSave={handleSave}
      />
    </div>
  )
}
