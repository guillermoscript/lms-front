import { NextResponse } from 'next/server'
import { z } from 'zod'
import { examStaff } from '@/lib/ai/evals/route-auth'
import { savedCaseError } from '@/lib/ai/evals/route-responses'
import { insertExamCase, loadExamQuestionsForCases } from '@/lib/ai/evals/store'
import { buildExamCaseFromSubmission, type AiQuestionFeedback } from '@/lib/ai/evals/exam-from-submission'

type Params = { params: Promise<{ examId: string }> }

const bodySchema = z.object({
  submission_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
})

/**
 * Save a teacher-reviewed submission of this exam as a grading test: the
 * student's answers, expected to get the points the teacher settled on. The
 * case keeps no link to the student or the submission.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await examStaff(req, (await params).examId)
  if (ctx instanceof NextResponse) return ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { submission_id: submissionId, name } = parsed.data

  const { data: submission } = await ctx.supabase
    .from('exam_submissions')
    .select('submission_id, review_status, ai_data')
    .eq('submission_id', submissionId)
    .eq('exam_id', ctx.exam.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (submission.review_status !== 'teacher_reviewed') {
    return NextResponse.json({ error: 'not_reviewed' }, { status: 409 })
  }

  // exam_answers / exam_question_scores have no tenant_id: the submission was
  // pinned to this tenant and exam above.
  const [questions, { data: answers }, { data: scores }] = await Promise.all([
    loadExamQuestionsForCases(ctx.supabase, ctx.exam.id, ctx.tenantId),
    ctx.supabase.from('exam_answers').select('question_id, answer_text').eq('submission_id', submissionId),
    ctx.supabase.from('exam_question_scores').select('question_id, points_earned').eq('submission_id', submissionId),
  ])

  const aiData = submission.ai_data as { question_feedback?: AiQuestionFeedback } | null
  const built = buildExamCaseFromSubmission({
    questions,
    answers: answers ?? [],
    scores: (scores ?? []).map((s) => ({ ...s, points_earned: s.points_earned === null ? null : Number(s.points_earned) })),
    aiFeedback: aiData?.question_feedback ?? null,
  })
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 })

  const saved = await insertExamCase(ctx.supabase, { tenantId: ctx.tenantId, examId: ctx.exam.id }, {
    source: 'submission',
    name,
    importance_note: null,
    input: { answers: built.answers },
    expected: built.expected,
  })
  if ('error' in saved) return savedCaseError(saved.error)
  return NextResponse.json({ case: saved.case }, { status: 201 })
}
