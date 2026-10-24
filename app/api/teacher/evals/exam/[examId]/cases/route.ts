import { NextResponse } from 'next/server'
import { examStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, insertExamCase, loadExamQuestionsForCases } from '@/lib/ai/evals/store'
import { savedCaseError } from '@/lib/ai/evals/route-responses'
import { createExamCaseSchema } from '@/lib/ai/evals/schema'
import { validateExamCase } from '@/lib/ai/evals/exam-engine'

type Params = { params: Promise<{ examId: string }> }

/** The exam's grader test cases (answers and expected points only, never the key). */
export async function GET(req: Request, { params }: Params) {
  const ctx = await examStaff(req, (await params).examId)
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.supabase
    .from('ai_eval_cases')
    .select(CASE_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exam')
    .eq('target_id', ctx.exam.id)
    .order('created_at')
  if (error) return NextResponse.json({ error: 'Could not load test cases' }, { status: 500 })
  return NextResponse.json({ cases: data ?? [] })
}

/** Save a set of answers (from the preview, or written by hand / MCP). */
export async function POST(req: Request, { params }: Params) {
  const ctx = await examStaff(req, (await params).examId)
  if (ctx instanceof NextResponse) return ctx

  const parsed = createExamCaseSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid case', issues: parsed.error.issues }, { status: 400 })
  const input = parsed.data

  // Every answer and expectation must name a question of THIS exam.
  const questions = await loadExamQuestionsForCases(ctx.supabase, ctx.exam.id, ctx.tenantId)
  const checked = validateExamCase(questions, input.input.answers, input.expected.questions)
  if (!checked.ok) return NextResponse.json({ error: checked.error, question_id: checked.question_id }, { status: 400 })
  const expectedQuestions = checked.expectedQuestions ?? {}
  if (Object.keys(expectedQuestions).length === 0) {
    return NextResponse.json({ error: 'no_ai_questions' }, { status: 400 })
  }

  const saved = await insertExamCase(ctx.supabase, { tenantId: ctx.tenantId, examId: ctx.exam.id }, {
    source: input.source,
    name: input.name,
    importance_note: input.importance_note ?? null,
    expected: { ...input.expected, questions: expectedQuestions },
    input: input.input,
  })
  if ('error' in saved) return savedCaseError(saved.error)
  return NextResponse.json({ case: saved.case }, { status: 201 })
}
