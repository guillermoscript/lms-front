import { NextResponse } from 'next/server'
import { evalStaffForRow } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, loadExamQuestionsForCases } from '@/lib/ai/evals/store'
import { validateExamCase } from '@/lib/ai/evals/exam-engine'
import { examAnswersSchema, examExpectedSchema, gradedExpectedSchema, updateCaseSchema, updateExamCaseSchema, updateGradedCaseSchema } from '@/lib/ai/evals/schema'

type Params = { params: Promise<{ caseId: string }> }

/**
 * Edit a case. Editing a generated scenario marks it teacher_edited, so a
 * config change no longer regenerates it. Golden transcripts never change.
 */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await evalStaffForRow(req, 'ai_eval_cases', (await params).caseId)
  if (ctx instanceof NextResponse) return ctx

  const body = await req.json().catch(() => null)

  if (ctx.targetType === 'exam') {
    const exam = updateExamCaseSchema.safeParse(body)
    if (!exam.success) return NextResponse.json({ error: 'Invalid case', issues: exam.error.issues }, { status: 400 })
    const ep = exam.data

    const { data: stored } = await ctx.supabase
      .from('ai_eval_cases')
      .select('kind, input, expected')
      .eq('id', ctx.row.id)
      .eq('tenant_id', ctx.tenantId)
      .single()
    if (stored?.kind !== 'graded_exam') return NextResponse.json({ error: 'Not an exam case' }, { status: 400 })

    // Partials merge into what is stored: nothing the caller omits is dropped.
    const storedInput = (stored.input ?? {}) as { answers?: Record<string, string> }
    const storedExpected = (stored.expected ?? {}) as { questions?: object }
    const answers = examAnswersSchema.safeParse({ ...(storedInput.answers ?? {}), ...(ep.input?.answers ?? {}) })
    if (!answers.success) return NextResponse.json({ error: 'Invalid case', issues: answers.error.issues }, { status: 400 })
    const expected = examExpectedSchema.safeParse({
      ...storedExpected,
      ...(ep.expected ?? {}),
      questions: { ...(storedExpected.questions ?? {}), ...(ep.expected?.questions ?? {}) },
    })
    if (!expected.success) return NextResponse.json({ error: 'Invalid case', issues: expected.error.issues }, { status: 400 })

    // Edited answers and expectations must still name questions of this exam
    // (ones deleted since the case was written stay readable, but cannot be re-sent).
    const questions = await loadExamQuestionsForCases(ctx.supabase, ctx.exam.id, ctx.tenantId)
    const checked = validateExamCase(questions, ep.input?.answers, ep.expected?.questions)
    if (!checked.ok) return NextResponse.json({ error: checked.error, question_id: checked.question_id }, { status: 400 })

    // Closed questions are scored exactly; expectations on them are dropped.
    const closedIds = new Set(questions.filter((q) => q.question_type !== 'free_text').map((q) => String(q.question_id)))
    const mergedExpected = {
      ...expected.data,
      questions: Object.fromEntries(Object.entries(expected.data.questions).filter(([id]) => !closedIds.has(id))),
    }
    if (ep.expected !== undefined && Object.keys(mergedExpected.questions).length === 0) {
      return NextResponse.json({ error: 'no_ai_questions' }, { status: 400 })
    }

    const { data: updated, error: examError } = await ctx.supabase
      .from('ai_eval_cases')
      .update({
        ...(ep.name !== undefined ? { name: ep.name } : {}),
        ...(ep.importance_note !== undefined ? { importance_note: ep.importance_note } : {}),
        ...(ep.expected !== undefined ? { expected: mergedExpected } : {}),
        ...(ep.input !== undefined ? { input: { answers: answers.data } } : {}),
        teacher_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.row.id)
      .eq('tenant_id', ctx.tenantId)
      .select(CASE_COLUMNS)
      .single()
    if (examError) return NextResponse.json({ error: 'Could not save the case' }, { status: 500 })
    return NextResponse.json({ case: updated })
  }

  if (ctx.targetType === 'exercise' || ctx.targetType === 'checkpoint') {
    const graded = updateGradedCaseSchema.safeParse(body)
    if (!graded.success) return NextResponse.json({ error: 'Invalid case', issues: graded.error.issues }, { status: 400 })
    const gp = graded.data

    const { data: stored } = await ctx.supabase
      .from('ai_eval_cases')
      .select('kind, input, expected')
      .eq('id', ctx.row.id)
      .eq('tenant_id', ctx.tenantId)
      .single()
    if (stored?.kind !== 'graded_answer') return NextResponse.json({ error: 'Not a graded case' }, { status: 400 })

    // Partials merge into what is stored: nothing the caller omits is dropped.
    const expected = gradedExpectedSchema.safeParse({ ...(stored.expected as object), ...(gp.expected ?? {}) })
    if (!expected.success) return NextResponse.json({ error: 'Invalid case', issues: expected.error.issues }, { status: 400 })

    const { data: updated, error: gradedError } = await ctx.supabase
      .from('ai_eval_cases')
      .update({
        ...(gp.name !== undefined ? { name: gp.name } : {}),
        ...(gp.importance_note !== undefined ? { importance_note: gp.importance_note } : {}),
        ...(gp.expected !== undefined ? { expected: expected.data } : {}),
        ...(gp.input !== undefined ? { input: { ...(stored.input as object), content: gp.input.content } } : {}),
        teacher_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.row.id)
      .eq('tenant_id', ctx.tenantId)
      .select(CASE_COLUMNS)
      .single()
    if (gradedError) return NextResponse.json({ error: 'Could not save the case' }, { status: 500 })
    return NextResponse.json({ case: updated })
  }

  const parsed = updateCaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid case', issues: parsed.error.issues }, { status: 400 })
  const patch = parsed.data

  const { data: current } = await ctx.supabase
    .from('ai_eval_cases')
    .select('kind')
    .eq('id', ctx.row.id)
    .eq('tenant_id', ctx.tenantId)
    .single()
  if (patch.scenario && current?.kind !== 'scenario') {
    return NextResponse.json({ error: 'Only scenarios have an editable script' }, { status: 400 })
  }

  const { data, error } = await ctx.supabase
    .from('ai_eval_cases')
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.importance_note !== undefined ? { importance_note: patch.importance_note } : {}),
      ...(patch.expected !== undefined ? { expected: patch.expected } : {}),
      ...(patch.must_keep !== undefined ? { must_keep: patch.must_keep } : {}),
      ...(patch.scenario !== undefined ? { input: patch.scenario } : {}),
      teacher_edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.row.id)
    .eq('tenant_id', ctx.tenantId)
    .select(CASE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: 'Could not save the case' }, { status: 500 })
  return NextResponse.json({ case: data })
}

export async function DELETE(req: Request, { params }: Params) {
  const ctx = await evalStaffForRow(req, 'ai_eval_cases', (await params).caseId)
  if (ctx instanceof NextResponse) return ctx

  const { error } = await ctx.supabase.from('ai_eval_cases').delete().eq('id', ctx.row.id).eq('tenant_id', ctx.tenantId)
  if (error) return NextResponse.json({ error: 'Could not delete the case' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
