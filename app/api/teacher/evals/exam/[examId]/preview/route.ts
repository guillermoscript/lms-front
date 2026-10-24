import { NextResponse } from 'next/server'
import { NoObjectGeneratedError, NoOutputGeneratedError } from 'ai'
import { z } from 'zod'
import { examStaff } from '@/lib/ai/evals/route-auth'
import { loadExamQuestionsForCases } from '@/lib/ai/evals/store'
import { examAnswersSchema } from '@/lib/ai/evals/schema'
import { validateExamCase } from '@/lib/ai/evals/exam-engine'
import { ExamGraderIncompleteError, previewExamGrading } from '@/lib/exams/grade'
import { hasPlanFeature } from '@/lib/plans/server'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'

export const maxDuration = 120

type Params = { params: Promise<{ examId: string }> }

const bodySchema = z.object({
  answers: examAnswersSchema,
  locale: z.enum(['en', 'es']).optional(),
})

/**
 * "Try grading": the SAVED exam graded on made-up answers by the school's own
 * grader. Nothing is written. The response carries scores and feedback only:
 * no rubric, answer key or option flags.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await examStaff(req, (await params).examId)
  if (ctx instanceof NextResponse) return ctx

  if (!(await hasPlanFeature(ctx.tenantId, 'ai_grading'))) {
    return NextResponse.json({ error: 'plan_required' }, { status: 402 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid answers', issues: parsed.error.issues }, { status: 400 })

  const questions = await loadExamQuestionsForCases(ctx.supabase, ctx.exam.id, ctx.tenantId)
  const checked = validateExamCase(questions, parsed.data.answers, undefined)
  if (!checked.ok) return NextResponse.json({ error: checked.error, question_id: checked.question_id }, { status: 400 })
  if (!questions.some((q) => q.question_type === 'free_text')) {
    return NextResponse.json({ error: 'no_ai_questions' }, { status: 409 })
  }

  return withTenantAi(
    { tenantId: ctx.tenantId, feature: 'exam_grader', canConfigure: ctx.role === 'admin', actorId: ctx.user.id },
    async (ai) => {
      const grader = await ai.getModelForFeature('exam_grader')
      try {
        const result = await previewExamGrading({
          tenantId: ctx.tenantId,
          examId: ctx.exam.id,
          answers: parsed.data.answers,
          grader,
          locale: parsed.data.locale ?? 'en',
        })
        return NextResponse.json(result)
      } catch (e) {
        if (e instanceof ExamGraderIncompleteError || NoObjectGeneratedError.isInstance(e) || NoOutputGeneratedError.isInstance(e)) {
          return NextResponse.json({ error: 'grader_failed' }, { status: 502 })
        }
        throw e
      }
    }
  )
}
