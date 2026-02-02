import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// POST /api/teacher/submissions/[submissionId]/override
export async function POST(req: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { submissionId } = await params
  const { score, feedback, teacher_notes, question_overrides } = await req.json()

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
