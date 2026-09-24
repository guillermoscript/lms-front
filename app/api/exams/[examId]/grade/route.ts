import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { gradeExamSubmission } from '@/lib/exams/grade'
import { z } from 'zod'

export const maxDuration = 120

const bodySchema = z.object({
  submissionId: z.coerce.number().int().positive(),
  /** Interface locale for the feedback prose; anything unknown falls back to English. */
  locale: z.string().max(10).optional(),
})

/**
 * Grade the caller's own exam submission (#839).
 *
 * The web grades through the `gradeExamWithAI` server action; a native client
 * can't call a server action, so this route exposes the same grader over
 * cookie or `Authorization: Bearer` auth. The body carries only the submission
 * id — answers are read from `exam_answers`, the answer key with the service
 * role, and a graded submission is refused (409).
 */
export async function POST(req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const auth = await getApiAuthContext(req)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const examId = Number((await params).examId)
  if (!Number.isInteger(examId) || examId <= 0) {
    return Response.json({ error: 'Invalid exam id' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'submissionId is required' }, { status: 400 })

  try {
    const outcome = await gradeExamSubmission({
      supabase: auth.supabase,
      userId: auth.user.id,
      tenantId: auth.tenantId,
      submissionId: parsed.data.submissionId,
      examId,
      locale: parsed.data.locale ?? 'en',
    })
    if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status })
    return Response.json({
      score: outcome.score,
      overall_feedback: outcome.overall_feedback,
      question_feedback: outcome.question_feedback,
    })
  } catch (error) {
    console.error('Exam grading failed:', error)
    try {
      const Sentry = await import('@sentry/nextjs')
      Sentry.captureException(error, { extra: { examId, submissionId: parsed.data.submissionId } })
    } catch {}
    return Response.json({ error: 'Failed to grade exam' }, { status: 500 })
  }
}
