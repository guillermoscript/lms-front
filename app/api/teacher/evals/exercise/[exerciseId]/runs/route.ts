import { after, NextResponse } from 'next/server'
import { exerciseStaff } from '@/lib/ai/evals/route-auth'
import { ensureExerciseGraderVersion, exerciseSurfaceFits, surfaceOfKind } from '@/lib/ai/evals/store'
import { EVAL_LIMITS } from '@/lib/ai/evals/schema'
import { estimateExerciseModelCalls } from '@/lib/ai/evals/scenario-summary'
import { hasPlanFeature } from '@/lib/plans/server'
import { executeEvalRun, freeStaleRuns, runLimitReached } from '@/lib/ai/evals/runner'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

type Params = { params: Promise<{ exerciseId: string }> }

export async function GET(req: Request, { params }: Params) {
  const ctx = await exerciseStaff(req, (await params).exerciseId, { surface: 'any' })
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.supabase
    .from('ai_eval_runs')
    .select('id, status, summary, model_ids, error, created_at, started_at, finished_at, version_id, ai_config_versions(version_no)')
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exercise')
    .eq('target_id', ctx.exercise.id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: 'Could not load runs' }, { status: 500 })
  return NextResponse.json({ runs: data ?? [] })
}

/**
 * Queue a run of every case against the SAVED exercise (not the editor draft)
 * and execute it after responding, on the school's own grader key (BYOK).
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await exerciseStaff(req, (await params).exerciseId, { surface: 'any' })
  if (ctx instanceof NextResponse) return ctx

  const admin = createAdminClient()

  if (await runLimitReached(admin, ctx.tenantId)) {
    return NextResponse.json({ error: 'run_limit', limit: EVAL_LIMITS.runsPerTenantPerDay }, { status: 429 })
  }

  const { data: cases } = await ctx.supabase
    .from('ai_eval_cases')
    .select('kind, input')
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exercise')
    .eq('target_id', ctx.exercise.id)
  if (!cases?.length) return NextResponse.json({ error: 'no_cases' }, { status: 409 })

  // Cases of a surface the exercise's type no longer serves cannot run.
  const surfaces = cases.map((c) => surfaceOfKind(c.kind))
  if (surfaces.some((surface) => !surface || !exerciseSurfaceFits(surface, ctx.exercise.exercise_type))) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 409 })
  }
  // Voice tests spend the same plan feature as the production voice route.
  if (surfaces.includes('voice') && !(await hasPlanFeature(ctx.tenantId, 'voice_exercises'))) {
    return NextResponse.json({ error: 'plan_required' }, { status: 402 })
  }

  // BYOK: resolve the grader before any row is written.
  return withTenantAi(
    { tenantId: ctx.tenantId, feature: surfaces.every((s) => s === 'coach') ? 'exercise_coach' : 'exercise_grader', canConfigure: ctx.role === 'admin', actorId: ctx.user.id },
    async (ai) => {
      // Same models the runner will resolve; a missing key fails before any row.
      if (surfaces.some((s) => s === 'graded' || s === 'voice')) await ai.getModelForFeature('exercise_grader')
      if (surfaces.some((s) => s !== 'graded')) {
        await Promise.all((['exercise_coach', 'eval_simulator', 'eval_judge'] as const).map((f) => ai.getModelForFeature(f)))
      }

      const versionId = await ensureExerciseGraderVersion(admin, ctx.exercise.id)
      await freeStaleRuns(admin, ctx.tenantId, 'exercise', ctx.exercise.id)

      const { data: run, error } = await ctx.supabase
        .from('ai_eval_runs')
        .insert({
          tenant_id: ctx.tenantId,
          target_type: 'exercise',
          target_id: ctx.exercise.id,
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
      return NextResponse.json({ run, estimated_model_calls: estimateExerciseModelCalls(cases) }, { status: 202 })
    }
  )
}
