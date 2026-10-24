import { NextResponse } from 'next/server'
import { examStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, loadExamQuestionsForCases } from '@/lib/ai/evals/store'
import { createExamCaseSchema, EVAL_LIMITS } from '@/lib/ai/evals/schema'
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

  const { count } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exam')
    .eq('target_id', ctx.exam.id)
  if ((count ?? 0) >= EVAL_LIMITS.maxCasesPerTarget) {
    return NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })
  }

  const { data, error } = await ctx.supabase
    .from('ai_eval_cases')
    .insert({
      tenant_id: ctx.tenantId,
      target_type: 'exam',
      target_id: ctx.exam.id,
      kind: 'graded_exam',
      source: input.source,
      name: input.name,
      importance_note: input.importance_note ?? null,
      expected: { ...input.expected, questions: expectedQuestions },
      input: input.input,
    })
    .select(CASE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: 'Could not save the case' }, { status: 500 })
  return NextResponse.json({ case: data }, { status: 201 })
}
