import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { NextRequest } from 'next/server'
import { track } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

// POST /api/teacher/submissions/[submissionId]/override
export async function POST(req: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { submissionId } = await params
  const { score, feedback, teacher_notes, question_overrides } = await req.json()

  // Validate submission belongs to tenant. `score` and `ai_model_used` ride
  // along on the query that already has to happen — they are what makes
  // `ai_grade_overridden` meaningful (was the grade being replaced an AI grade,
  // and by how much did the human move it) at no extra round trip.
  const { data: submission } = await supabase
    .from('exam_submissions')
    .select('submission_id, exam_id, score, ai_model_used, exam:exams!inner(course:courses!inner(tenant_id))')
    .eq('submission_id', submissionId)
    .single()

  const examCourse = (submission as any)?.exam?.course
  if (!submission || !examCourse || examCourse.tenant_id !== tenantId) {
    return Response.json({ error: 'Submission not found' }, { status: 404 })
  }

  // Update overall score
  const { error: scoreError } = await supabase
    .from('exam_scores')
    .upsert({
      submission_id: parseInt(submissionId),
      score,
      feedback,
      teacher_id: user.id,
      teacher_notes,
      is_overridden: true,
      reviewed_at: new Date().toISOString()
    }, { onConflict: 'submission_id' })

  if (scoreError) return Response.json({ error: scoreError.message }, { status: 500 })

  // Update individual question overrides if provided
  if (question_overrides && question_overrides.length > 0) {
    const updates = question_overrides.map((q: any) =>
      supabase
        .from('exam_answers')
        .update({
          is_correct: q.is_correct,
          feedback: q.feedback
        })
        .eq('submission_id', submissionId)
        .eq('question_id', q.question_id)
    )

    await Promise.all(updates)
  }

  // Update submission review status
  await supabase
    .from('exam_submissions')
    .update({ review_status: 'teacher_reviewed' })
    .eq('submission_id', submissionId)

  // The AI-grading quality metric. A high override rate means teachers do not
  // trust the grader, and nothing else in the product says so — the teacher
  // silently fixes the score and moves on. `was_ai_graded` separates a genuine
  // correction of the AI from a teacher grading an ungraded submission.
  const aiScore = (submission as { score: number | null }).score
  const wasAiGraded = Boolean((submission as { ai_model_used: string | null }).ai_model_used)
  const newScore = typeof score === 'number' ? score : null

  await track(
    ANALYTICS_EVENTS.AI_GRADE_OVERRIDDEN,
    {
      submission_id: parseInt(submissionId),
      exam_id: (submission as { exam_id: number }).exam_id,
      was_ai_graded: wasAiGraded,
      ai_model: (submission as { ai_model_used: string | null }).ai_model_used,
      previous_score: aiScore,
      new_score: newScore,
      score_delta:
        aiScore !== null && newScore !== null ? newScore - aiScore : null,
      question_overrides_count: question_overrides?.length ?? 0,
    },
    { userId: user.id, tenantId, role: 'teacher' }
  )

  return Response.json({ success: true })
}
