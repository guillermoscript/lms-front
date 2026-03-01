import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { NextRequest } from 'next/server'

// POST /api/teacher/submissions/[submissionId]/override
export async function POST(req: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { submissionId } = await params
  const { score, feedback, teacher_notes, question_overrides } = await req.json()

  // Validate submission belongs to tenant
  const { data: submission } = await supabase
    .from('exam_submissions')
    .select('submission_id, exam:exams!inner(course:courses!inner(tenant_id))')
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

  return Response.json({ success: true })
}
