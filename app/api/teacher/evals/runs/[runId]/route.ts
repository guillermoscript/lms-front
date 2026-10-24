import { NextResponse } from 'next/server'
import { lessonTaskStaffForRow } from '@/lib/ai/evals/route-auth'

type Params = { params: Promise<{ runId: string }> }

/** One run with its per-case results (the report). Poll while status is queued/running. */
export async function GET(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaffForRow(req, 'ai_eval_runs', (await params).runId)
  if (ctx instanceof NextResponse) return ctx

  const [{ data: run }, { data: results }] = await Promise.all([
    ctx.supabase
      .from('ai_eval_runs')
      .select('id, target_id, status, summary, model_ids, error, created_at, started_at, finished_at, version_id, ai_config_versions(version_no)')
      .eq('id', ctx.row.id)
      .eq('tenant_id', ctx.tenantId)
      .single(),
    ctx.supabase
      .from('ai_eval_results')
      .select('id, case_id, case_name, case_kind, expected, transcript, completed, completed_turn, verdicts, deviation, passed, error, created_at')
      .eq('run_id', ctx.row.id)
      .eq('tenant_id', ctx.tenantId)
      .order('created_at'),
  ])
  if (!run) return new NextResponse('Not found', { status: 404 })
  return NextResponse.json({ run, results: results ?? [] })
}
