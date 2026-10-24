import { after, NextResponse } from 'next/server'
import { checkpointStaff } from '@/lib/ai/evals/route-auth'
import { ensureCheckpointGraderVersion } from '@/lib/ai/evals/store'
import { EVAL_LIMITS, GRADED_REPEATS } from '@/lib/ai/evals/schema'
import { executeEvalRun, freeStaleRuns, runLimitReached } from '@/lib/ai/evals/runner'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

type Params = { params: Promise<{ checkpointId: string }> }

export async function GET(req: Request, { params }: Params) {
  const ctx = await checkpointStaff(req, (await params).checkpointId)
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.supabase
    .from('ai_eval_runs')
    .select('id, status, summary, model_ids, error, created_at, started_at, finished_at, version_id, ai_config_versions(version_no)')
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'checkpoint')
    .eq('target_id', ctx.checkpoint.id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: 'Could not load runs' }, { status: 500 })
  return NextResponse.json({ runs: data ?? [] })
}

/**
 * Queue a run of every case against the SAVED checkpoint exercise (not the editor draft)
 * and execute it after responding, on the school's own grader key (BYOK).
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await checkpointStaff(req, (await params).checkpointId)
  if (ctx instanceof NextResponse) return ctx

  const admin = createAdminClient()

  if (await runLimitReached(admin, ctx.tenantId)) {
    return NextResponse.json({ error: 'run_limit', limit: EVAL_LIMITS.runsPerTenantPerDay }, { status: 429 })
  }

  const { count: caseCount } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'checkpoint')
    .eq('target_id', ctx.checkpoint.id)
  if (!caseCount) return NextResponse.json({ error: 'no_cases' }, { status: 409 })

  // BYOK: resolve the grader before any row is written.
  return withTenantAi(
    { tenantId: ctx.tenantId, feature: 'checkpoint_grader', canConfigure: ctx.role === 'admin', actorId: ctx.user.id },
    async (ai) => {
      await ai.getModelForFeature('checkpoint_grader')

      const versionId = await ensureCheckpointGraderVersion(admin, ctx.checkpoint.id)
      await freeStaleRuns(admin, ctx.tenantId, 'checkpoint', ctx.checkpoint.id)

      const { data: run, error } = await ctx.supabase
        .from('ai_eval_runs')
        .insert({
          tenant_id: ctx.tenantId,
          target_type: 'checkpoint',
          target_id: ctx.checkpoint.id,
          version_id: versionId,
          created_by: ctx.user.id,
        })
        .select('id, status, version_id, created_at')
        .single()
      if (error) {
        if (error.code === '23505') return NextResponse.json({ error: 'run_in_progress' }, { status: 409 })
        return NextResponse.json({ error: 'Could not start the run' }, { status: 500 })
      }

      after(() => executeEvalRun(run.id, { actorId: ctx.user.id }))
      return NextResponse.json({ run, estimated_model_calls: caseCount * GRADED_REPEATS }, { status: 202 })
    }
  )
}
