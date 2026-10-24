import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { lessonTaskStaff } from '@/lib/ai/evals/route-auth'
import { ensureLessonTaskVersion, loadLiveLessonTaskConfig } from '@/lib/ai/evals/store'
import { draftConfigSchema, EVAL_LIMITS, type DraftConfig } from '@/lib/ai/evals/schema'
import { executeEvalRun, freeStaleRuns, runLimitReached } from '@/lib/ai/evals/runner'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { createAdminClient } from '@/lib/supabase/admin'

// The run itself continues after the response (after()); this covers both.
export const maxDuration = 300

type Params = { params: Promise<{ lessonId: string }> }

export async function GET(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaff(req, (await params).lessonId)
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.supabase
    .from('ai_eval_runs')
    .select('id, status, summary, model_ids, error, created_at, started_at, finished_at, version_id, ai_config_versions(version_no)')
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'lesson_ai_task')
    .eq('target_id', ctx.lesson.id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: 'Could not load runs' }, { status: 500 })
  return NextResponse.json({ runs: data ?? [] })
}

const bodySchema = z.object({ draft: draftConfigSchema.optional() }).default({})

/**
 * Queue a run of every case against a version — the live task, or the editor's
 * unsaved draft — and execute it after responding. The model calls go to the
 * school's own key (BYOK); the run fails cleanly if there is none.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaff(req, (await params).lessonId)
  if (ctx instanceof NextResponse) return ctx

  // Not plan-gated, like the preview it automates: every call is on the
  // school's own key. The daily cap below bounds what one run button can spend.
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const admin = createAdminClient()

  if (await runLimitReached(admin, ctx.tenantId)) {
    return NextResponse.json({ error: 'run_limit', limit: EVAL_LIMITS.runsPerTenantPerDay }, { status: 429 })
  }

  const config = parsed.data.draft ?? (await loadLiveLessonTaskConfig(admin, ctx.lesson.id, ctx.tenantId))
  if (!config) return NextResponse.json({ error: 'no_task' }, { status: 409 })

  const { count: caseCount } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'lesson_ai_task')
    .eq('target_id', ctx.lesson.id)
  if (!caseCount) return NextResponse.json({ error: 'no_cases' }, { status: 409 })

  // BYOK order: resolve every model the run needs before any row is written,
  // so a school without a key gets the typed setup error and nothing queued.
  return withTenantAi(
    { tenantId: ctx.tenantId, feature: 'eval_simulator', canConfigure: ctx.role === 'admin', actorId: ctx.user.id },
    async (ai) => {
      await Promise.all(
        (['lesson_tutor', 'lesson_verifier', 'eval_simulator', 'eval_judge'] as const).map((f) => ai.getModelForFeature(f))
      )
      return queueRun(ctx, admin, config, caseCount)
    }
  )
}

async function queueRun(
  ctx: Exclude<Awaited<ReturnType<typeof lessonTaskStaff>>, NextResponse>,
  admin: ReturnType<typeof createAdminClient>,
  config: DraftConfig,
  caseCount: number
) {
  const versionId = await ensureLessonTaskVersion(admin, ctx.lesson.id, config)

  // Free a slot held by a run whose process died.
  await freeStaleRuns(admin, ctx.tenantId, 'lesson_ai_task', ctx.lesson.id)

  // Inserted under RLS (staff of this tenant, created_by = caller, status queued).
  const { data: run, error } = await ctx.supabase
    .from('ai_eval_runs')
    .insert({
      tenant_id: ctx.tenantId,
      target_type: 'lesson_ai_task',
      target_id: ctx.lesson.id,
      version_id: versionId,
      created_by: ctx.user.id,
    })
    .select('id, status, version_id, created_at')
    .single()
  if (error) {
    // The partial unique index allows one active run per task.
    if (error.code === '23505') return NextResponse.json({ error: 'run_in_progress' }, { status: 409 })
    return NextResponse.json({ error: 'Could not start the run' }, { status: 500 })
  }

  after(() => executeEvalRun(run.id, { actorId: ctx.user.id }))

  return NextResponse.json({ run, estimated_model_calls: caseCount * 12 }, { status: 202 })
}
