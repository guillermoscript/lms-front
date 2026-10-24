import { NextResponse } from 'next/server'
import { checkpointStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS } from '@/lib/ai/evals/store'
import { createGradedCaseSchema, EVAL_LIMITS } from '@/lib/ai/evals/schema'

type Params = { params: Promise<{ checkpointId: string }> }

/** The checkpoint's graded-answer test cases. */
export async function GET(req: Request, { params }: Params) {
  const ctx = await checkpointStaff(req, (await params).checkpointId)
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.supabase
    .from('ai_eval_cases')
    .select(CASE_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'checkpoint')
    .eq('target_id', ctx.checkpoint.id)
    .order('created_at')
  if (error) return NextResponse.json({ error: 'Could not load test cases' }, { status: 500 })
  return NextResponse.json({ cases: data ?? [] })
}

/** Save a graded answer (from the preview, or written by hand / MCP). */
export async function POST(req: Request, { params }: Params) {
  const ctx = await checkpointStaff(req, (await params).checkpointId)
  if (ctx instanceof NextResponse) return ctx

  const parsed = createGradedCaseSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid case', issues: parsed.error.issues }, { status: 400 })
  const input = parsed.data

  const { count } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'checkpoint')
    .eq('target_id', ctx.checkpoint.id)
  if ((count ?? 0) >= EVAL_LIMITS.maxCasesPerTarget) {
    return NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })
  }

  const { data, error } = await ctx.supabase
    .from('ai_eval_cases')
    .insert({
      tenant_id: ctx.tenantId,
      target_type: 'checkpoint',
      target_id: ctx.checkpoint.id,
      kind: 'graded_answer',
      source: input.source,
      name: input.name,
      importance_note: input.importance_note ?? null,
      expected: input.expected,
      input: input.input,
      golden_output: (input.golden_output ?? null) as never,
    })
    .select(CASE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: 'Could not save the case' }, { status: 500 })
  return NextResponse.json({ case: data }, { status: 201 })
}
