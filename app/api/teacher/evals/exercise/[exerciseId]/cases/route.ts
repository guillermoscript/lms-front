import { NextResponse } from 'next/server'
import { exerciseStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, surfaceOfKind } from '@/lib/ai/evals/store'
import { createExerciseCaseSchema, EVAL_LIMITS } from '@/lib/ai/evals/schema'

type Params = { params: Promise<{ exerciseId: string }> }

const EXERCISE_CASE_KINDS = ['graded_answer', 'coach_scenario', 'voice_scenario']

/** The exercise's test cases: graded answers, coach scenarios and voice scenarios. `?kind=` filters by case kind. */
export async function GET(req: Request, { params }: Params) {
  const kind = new URL(req.url).searchParams.get('kind')
  const known = kind !== null && EXERCISE_CASE_KINDS.includes(kind)
  const ctx = await exerciseStaff(req, (await params).exerciseId, { surface: known ? surfaceOfKind(kind) : 'any' })
  if (ctx instanceof NextResponse) return ctx
  if (kind !== null && !known) return NextResponse.json({ error: 'invalid', issues: [{ message: 'Unknown kind' }] }, { status: 400 })

  let query = ctx.supabase
    .from('ai_eval_cases')
    .select(CASE_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exercise')
    .eq('target_id', ctx.exercise.id)
  if (known) query = query.eq('kind', kind)
  const { data, error } = await query.order('created_at')
  if (error) return NextResponse.json({ error: 'Could not load test cases' }, { status: 500 })
  return NextResponse.json({ cases: data ?? [] })
}

/** Save a test case: a graded answer (from the preview, or by hand / MCP), a coach scenario or a voice scenario. */
export async function POST(req: Request, { params }: Params) {
  const body = await req.json().catch(() => null)
  // The case kind decides which exercise types the request may target.
  const kind = typeof (body as { kind?: unknown } | null)?.kind === 'string' ? (body as { kind: string }).kind : null
  const ctx = await exerciseStaff(req, (await params).exerciseId, { surface: (kind && surfaceOfKind(kind)) || 'graded' })
  if (ctx instanceof NextResponse) return ctx

  const parsed = createExerciseCaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })
  const input = parsed.data

  const { count } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exercise')
    .eq('target_id', ctx.exercise.id)
  if ((count ?? 0) >= EVAL_LIMITS.maxCasesPerTarget) {
    return NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })
  }

  const row =
    input.kind === 'graded_answer'
      ? { golden_output: (input.golden_output ?? null) as never }
      : { must_keep: input.must_keep }

  const { data, error } = await ctx.supabase
    .from('ai_eval_cases')
    .insert({
      tenant_id: ctx.tenantId,
      target_type: 'exercise',
      target_id: ctx.exercise.id,
      kind: input.kind,
      source: input.source,
      name: input.name,
      importance_note: input.importance_note ?? null,
      expected: input.expected as never,
      input: input.input as never,
      ...row,
    })
    .select(CASE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: 'Could not save the case' }, { status: 500 })
  return NextResponse.json({ case: data }, { status: 201 })
}
