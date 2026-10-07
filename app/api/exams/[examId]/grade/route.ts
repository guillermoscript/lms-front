import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { gradeExamSubmission } from '@/lib/exams/grade'
import { AiError, aiErrorBody } from '@/lib/ai/errors'
import { canConfigureAi } from '@/lib/exercises/ai-failure'
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
 * role, and a graded submission is refused (409). Free text is graded on the
 * school's own AI key; with no usable key it is parked for teacher review (200,
 * `overall_feedback: 'pending_teacher_review'`). Quota or provider failures
 * answer the typed `{error:{code,...}}` body and leave the submission pending.
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
    if (!outcome.ok) {
      if (outcome.aiCode) {
        // Typed AI failure (quota / provider down): 402/422/424/429/502, never 401/403.
        // The submission stays pending, so the client may retry.
        const err = new AiError(outcome.aiCode, 'ai')
        return Response.json(
          aiErrorBody(err, {
            feature: 'exam_grader',
            canConfigure: await canConfigureAi(auth.supabase, auth.user.id, auth.tenantId),
            // Only known locales reach the settings link; the body is not trusted.
            locale: parsed.data.locale === 'es' ? 'es' : 'en',
          }),
          { status: outcome.status, headers: { 'Cache-Control': 'no-store' } },
        )
      }
      return Response.json({ error: outcome.error }, { status: outcome.status })
    }
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
