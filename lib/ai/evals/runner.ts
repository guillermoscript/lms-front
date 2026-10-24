import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTenantAi } from '@/lib/ai/tenant-ai'
import { DRIFT_THRESHOLD } from './deviation'
import { draftScenarios, runCase, type EngineContext } from './lesson-task-engine'
import { CASE_COLUMNS, snapshotToConfig, toCaseRow } from './store'
import { EVAL_LIMITS, type CaseOutcome, type EvalCaseRow, type RunSummary } from './schema'

type Admin = ReturnType<typeof createAdminClient>

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  // Provider errors can echo request details; keep the report short and key-free.
  return message.replace(/(sk|key|token)[-_a-z0-9]{8,}/gi, '[redacted]').slice(0, 500)
}

/**
 * Regenerates the untouched generated scenarios of a target when the version
 * changed and the suite asks for it. Teacher-edited ones are kept as they are.
 */
async function regenerateStaleScenarios(
  admin: Admin,
  ctx: EngineContext & { tenantId: string; lessonId: number; versionId: string; generator: EngineContext['models']['judge'] },
  cases: EvalCaseRow[]
): Promise<number> {
  const stale = cases.filter(
    (c) => c.kind === 'scenario' && c.source === 'generated' && !c.teacher_edited && c.generated_for_version_id !== ctx.versionId
  )
  if (stale.length === 0) return 0

  const drafted = await draftScenarios(ctx.generator, {
    lesson: ctx.lesson,
    config: ctx.config,
    count: stale.length,
    onModelCall: ctx.onModelCall,
  })
  if (drafted.length === 0) return 0

  await admin.from('ai_eval_cases').delete().in('id', stale.map((c) => c.id)).eq('tenant_id', ctx.tenantId)
  await admin.from('ai_eval_cases').insert(
    drafted.map((d) => ({
      tenant_id: ctx.tenantId,
      target_type: 'lesson_ai_task',
      target_id: ctx.lessonId,
      kind: 'scenario',
      source: 'generated',
      name: d.name,
      expected: d.expected,
      must_keep: d.must_keep,
      input: d.input,
      generated_for_version_id: ctx.versionId,
    }))
  )
  return drafted.length
}

/**
 * Executes one queued run end to end with the service role (it outlives the
 * request that queued it). The tenant comes from the run row the caller
 * inserted under RLS; every read and write below is pinned to it.
 */
export async function executeEvalRun(runId: string, opts: { actorId?: string | null } = {}) {
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('ai_eval_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'queued')
    .select('id, tenant_id, target_type, target_id, version_id')
    .maybeSingle()
  if (!run) return // already claimed

  const tenantId = run.tenant_id
  const lessonId = run.target_id
  let modelCalls = 0

  const fail = async (error: unknown) => {
    await admin
      .from('ai_eval_runs')
      .update({ status: 'failed', error: errorMessage(error), finished_at: new Date().toISOString(), summary: { model_calls: modelCalls } })
      .eq('id', runId)
      .eq('tenant_id', tenantId)
  }

  try {
    const [{ data: version }, { data: lesson }, { data: suite }] = await Promise.all([
      admin.from('ai_config_versions').select('id, snapshot').eq('id', run.version_id).eq('tenant_id', tenantId).maybeSingle(),
      admin.from('lessons').select('title, description, content').eq('id', lessonId).eq('tenant_id', tenantId).maybeSingle(),
      admin.from('ai_eval_suites').select('auto_regenerate').eq('target_type', 'lesson_ai_task').eq('target_id', lessonId).eq('tenant_id', tenantId).maybeSingle(),
    ])
    if (!version || !lesson) throw new Error('The lesson or its task version no longer exists.')

    // The school's own models (BYOK). A missing key fails here, before any case runs.
    const ai = createTenantAi(tenantId, { actorId: opts.actorId ?? null })
    const [tutor, verifier, simulator, judge, generator] = await Promise.all([
      ai.getModelForFeature('lesson_tutor'),
      ai.getModelForFeature('lesson_verifier'),
      ai.getModelForFeature('eval_simulator'),
      ai.getModelForFeature('eval_judge'),
      ai.getModelForFeature('eval_generator'),
    ])
    const label = (m: { providerId: string; modelId: string }) => `${m.providerId}/${m.modelId}`
    await admin
      .from('ai_eval_runs')
      .update({ model_ids: { tutor: label(tutor), verifier: label(verifier), simulator: label(simulator), judge: label(judge) } })
      .eq('id', runId)
      .eq('tenant_id', tenantId)

    const ctx: EngineContext = {
      models: { tutor: tutor.model, verifier: verifier.model, simulator: simulator.model, judge: judge.model },
      lesson: { title: lesson.title ?? undefined, description: lesson.description ?? undefined, content: lesson.content ?? undefined },
      config: snapshotToConfig(version.snapshot),
      onModelCall: () => { modelCalls++ },
    }

    const loadCases = async () => {
      const { data } = await admin
        .from('ai_eval_cases')
        .select(CASE_COLUMNS)
        .eq('target_type', 'lesson_ai_task')
        .eq('target_id', lessonId)
        .eq('tenant_id', tenantId)
        .order('created_at')
        .limit(EVAL_LIMITS.maxCasesPerTarget)
      return (data ?? []).map((row) => toCaseRow(row as Record<string, unknown>))
    }

    let cases = await loadCases()
    let regenerated = 0
    if (suite?.auto_regenerate ?? true) {
      regenerated = await regenerateStaleScenarios(
        admin,
        { ...ctx, tenantId, lessonId, versionId: version.id, generator: generator.model },
        cases
      )
      if (regenerated > 0) cases = await loadCases()
    }

    const outcomes: { testCase: EvalCaseRow; outcome: CaseOutcome }[] = []
    await mapLimit(cases, EVAL_LIMITS.concurrency, async (testCase) => {
      let outcome: CaseOutcome
      try {
        outcome = await runCase(ctx, testCase)
      } catch (error) {
        outcome = { transcript: [], completed: false, completed_turn: null, verdicts: [], deviation: 100, passed: false, error: errorMessage(error) }
      }
      outcomes.push({ testCase, outcome })
      await admin.from('ai_eval_results').insert({
        tenant_id: tenantId,
        run_id: runId,
        case_id: testCase.id,
        case_name: testCase.name,
        case_kind: testCase.kind,
        expected: testCase.expected,
        transcript: outcome.transcript,
        completed: outcome.error ? null : outcome.completed,
        completed_turn: outcome.completed_turn,
        verdicts: outcome.verdicts,
        deviation: outcome.deviation,
        passed: outcome.passed,
        error: outcome.error ?? null,
      })
    })

    const scored = outcomes.filter((o) => !o.outcome.error)
    const summary: RunSummary = {
      total: outcomes.length,
      passed: scored.filter((o) => o.outcome.passed).length,
      failed: scored.filter((o) => !o.outcome.passed).length,
      errored: outcomes.length - scored.length,
      verdict_changes: scored.filter(
        (o) => o.testCase.kind === 'golden_chat' && o.testCase.golden_output && o.testCase.golden_output.completed !== o.outcome.completed
      ).length,
      avg_deviation: scored.length ? Math.round(scored.reduce((sum, o) => sum + o.outcome.deviation, 0) / scored.length) : 0,
      model_calls: modelCalls,
      regenerated_scenarios: regenerated,
    }

    await admin
      .from('ai_eval_runs')
      .update({ status: 'done', summary: { ...summary, drift_threshold: DRIFT_THRESHOLD }, finished_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('tenant_id', tenantId)
  } catch (error) {
    await fail(error)
  }
}
