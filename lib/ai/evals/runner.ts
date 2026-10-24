import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTenantAi } from '@/lib/ai/tenant-ai'
import { DRIFT_THRESHOLD } from './deviation'
import { draftScenarios, runCase, type EngineContext } from './lesson-task-engine'
import { CASE_COLUMNS, loadCheckpointGradingExercise, loadGradingExercise, loadScenarioExercise, snapshotToConfig, toCaseRow, toExamCaseRow, toGradedCaseRow } from './store'
import { runCoachCase, type CoachEngineContext } from './coach-engine'
import { runVoiceCase, type VoiceEngineContext } from './voice-engine'
import { partitionExerciseCases, summarizeScenarioItems, type ScenarioItem } from './scenario-summary'
import { runExamCase, type ExamEngineContext } from './exam-engine'
import { loadExamGradingContext } from '@/lib/exams/grade'
import { runGradedCase, type GradedEngineContext } from './graded-answer-engine'
import { gradeCheckpointAnswer } from '@/lib/checkpoints/grade-checkpoint-answer'
import type { WrittenGradingExercise } from '@/lib/exercises/evaluate-written'
import type { LanguageModel } from 'ai'
import { EVAL_LIMITS, type CaseOutcome, type CoachCaseRow, type CoachOutcome, type EvalCaseRow, type ExamCaseRow, type ExamOutcome, type ExamRunSummary, type GradedCaseRow, type GradedOutcome, type GradedRunSummary, type RunSummary, type VoiceCaseRow, type VoiceOutcome } from './schema'

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

/** A run still "running" after this long died with its process: free the slot. */
export const STALE_RUN_MS = 20 * 60 * 1000

/** Fails queued/running runs of a target that outlived their process, freeing its single active slot. */
export async function freeStaleRuns(admin: Admin, tenantId: string, targetType: 'lesson_ai_task' | 'exercise' | 'checkpoint' | 'exam', targetId: number) {
  await admin
    .from('ai_eval_runs')
    .update({ status: 'failed', error: 'Interrupted', finished_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .in('status', ['queued', 'running'])
    .lt('created_at', new Date(Date.now() - STALE_RUN_MS).toISOString())
}

/** Whether the tenant already queued its daily maximum of runs (any target). */
export async function runLimitReached(admin: Admin, tenantId: string): Promise<boolean> {
  const { count } = await admin
    .from('ai_eval_runs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  return (count ?? 0) >= EVAL_LIMITS.runsPerTenantPerDay
}

async function failRun(admin: Admin, runId: string, tenantId: string, error: unknown, modelCalls: number) {
  await admin
    .from('ai_eval_runs')
    .update({ status: 'failed', error: errorMessage(error), finished_at: new Date().toISOString(), summary: { model_calls: modelCalls } })
    .eq('id', runId)
    .eq('tenant_id', tenantId)
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
export async function executeEvalRun(runId: string, opts: { actorId?: string | null; locale?: string } = {}) {
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

  const fail = (error: unknown) => failRun(admin, runId, tenantId, error, modelCalls)

  if (run.target_type === 'exercise') {
    await executeExerciseRun(admin, { runId, tenantId, exerciseId: run.target_id, actorId: opts.actorId ?? null })
    return
  }

  if (run.target_type === 'checkpoint') {
    await executeCheckpointRun(admin, { runId, tenantId, checkpointId: run.target_id, actorId: opts.actorId ?? null })
    return
  }

  if (run.target_type === 'exam') {
    await executeExamRun(admin, { runId, tenantId, examId: run.target_id, actorId: opts.actorId ?? null, locale: opts.locale ?? 'en' })
    return
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

/**
 * Exercise run. Executes EVERY case kind of the exercise against the SAVED
 * exercise: graded answers (graded GRADED_REPEATS times by the exercise
 * grader, folded into one row each), coach scenarios (simulated student vs the
 * coach prompt) and voice scenarios (the same, as text, ending in the real
 * conversation grader). `summary` stays the graded summary (zeros when there
 * are no graded cases); `summary.scenario` is added only when scenario cases
 * ran. All models resolve before any result row is written.
 */
async function executeExerciseRun(admin: Admin, run: { runId: string; tenantId: string; exerciseId: number; actorId: string | null }) {
  const { runId, tenantId, exerciseId } = run
  let modelCalls = 0

  try {
    const exercise = await loadGradingExercise(admin, exerciseId, tenantId)
    if (!exercise) throw new Error('The exercise no longer exists.')

    const { data } = await admin
      .from('ai_eval_cases')
      .select(CASE_COLUMNS)
      .eq('target_type', 'exercise')
      .eq('target_id', exerciseId)
      .eq('tenant_id', tenantId)
      .in('kind', ['graded_answer', 'coach_scenario', 'voice_scenario'])
      .order('created_at')
      .limit(EVAL_LIMITS.maxCasesPerTarget)
    const parts = partitionExerciseCases((data ?? []) as unknown as { kind: string }[])
    const graded = parts.graded
    const coach = parts.coach
    const voice = parts.voice
    const hasScenarios = coach.length + voice.length > 0

    const scenarioExercise = hasScenarios ? await loadScenarioExercise(admin, exerciseId, tenantId) : null
    if (hasScenarios && !scenarioExercise) throw new Error('The exercise no longer exists.')

    // BYOK: every model this run needs, resolved BEFORE any row is written. A
    // missing key fails here. The voice grader and the graded cases use the
    // exercise grader; the coach, and the voice tutor stand-in, use the coach model.
    const ai = createTenantAi(tenantId, { actorId: run.actorId })
    const label = (m: { providerId: string; modelId: string }) => `${m.providerId}/${m.modelId}`
    const needsGrader = graded.length > 0 || voice.length > 0 || !hasScenarios
    const grader = needsGrader ? await ai.getModelForFeature('exercise_grader') : null
    const [coachModel, simulator, judge] = hasScenarios
      ? await Promise.all([ai.getModelForFeature('exercise_coach'), ai.getModelForFeature('eval_simulator'), ai.getModelForFeature('eval_judge')])
      : [null, null, null]
    await admin
      .from('ai_eval_runs')
      .update({
        model_ids: {
          ...(grader ? { grader: label(grader) } : {}),
          ...(coachModel && simulator && judge ? { coach: label(coachModel), simulator: label(simulator), judge: label(judge) } : {}),
        },
      })
      .eq('id', runId)
      .eq('tenant_id', tenantId)

    const onModelCall = () => { modelCalls++ }
    const gradedSummary = await runGradedCases(admin, {
      runId,
      tenantId,
      cases: graded,
      ctx: { grader: grader?.model as LanguageModel, exercise, onModelCall },
    })

    let scenario: ReturnType<typeof summarizeScenarioItems> | undefined
    if (scenarioExercise && coachModel && simulator && judge) {
      const items: ScenarioItem[] = []
      const coachCtx: CoachEngineContext = {
        models: { coach: coachModel.model, simulator: simulator.model, judge: judge.model },
        exercise: scenarioExercise,
        onModelCall,
      }
      const voiceCtx: VoiceEngineContext | null = grader
        ? {
            models: { tutor: coachModel.model, simulator: simulator.model, judge: judge.model, grader: grader.model },
            exercise: scenarioExercise,
            config: scenarioExercise.conversation,
            onModelCall,
          }
        : null

      const saveScenario = async (
        testCase: CoachCaseRow | VoiceCaseRow,
        outcome: CoachOutcome | VoiceOutcome | null,
        error?: string
      ) => {
        const { error: insertError } = await admin.from('ai_eval_results').insert({
          tenant_id: tenantId,
          run_id: runId,
          case_id: testCase.id,
          case_name: testCase.name,
          case_kind: testCase.kind,
          expected: testCase.expected as never,
          transcript: outcome?.transcript ?? [],
          completed: outcome ? outcome.completed : null,
          completed_turn: outcome?.completed_turn ?? null,
          verdicts: outcome?.verdicts ?? [],
          deviation: outcome?.deviation ?? null,
          passed: outcome ? outcome.passed : null,
          ...(outcome && 'score' in outcome ? { score: outcome.score, scores: [outcome.score] } : {}),
          output: (outcome?.output ?? null) as never,
          error: error ?? null,
        })
        // A result that could not be saved counts as an error, not a silent gap.
        return !insertError
      }

      await mapLimit<CoachCaseRow | VoiceCaseRow>([...coach, ...voice], EVAL_LIMITS.concurrency, async (testCase) => {
        let outcome: CoachOutcome | VoiceOutcome | null = null
        let error: string | undefined
        try {
          if (testCase.kind === 'coach_scenario') outcome = await runCoachCase(coachCtx, testCase)
          else if (voiceCtx) outcome = await runVoiceCase(voiceCtx, testCase)
        } catch (e) {
          error = errorMessage(e)
        }
        if (!(await saveScenario(testCase, outcome, error))) {
          outcome = null
          error = 'Could not save the result.'
        }
        items.push({
          kind: testCase.kind,
          outcome: outcome
            ? { passed: outcome.passed, deviation: outcome.deviation, reasons: (outcome.output.reasons as string[] | undefined) ?? [] }
            : null,
        })
      })
      scenario = summarizeScenarioItems(items)
    }

    await admin
      .from('ai_eval_runs')
      .update({
        status: 'done',
        summary: { ...gradedSummary, model_calls: modelCalls, ...(scenario ? { scenario } : {}) },
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .eq('tenant_id', tenantId)
  } catch (error) {
    await failRun(admin, runId, tenantId, error, modelCalls)
  }
}

/** Checkpoint text-grader run: same engine, graded by the checkpoint's own prompt. */
function executeCheckpointRun(admin: Admin, run: { runId: string; tenantId: string; checkpointId: number; actorId: string | null }) {
  return executeGradedRun(admin, {
    runId: run.runId,
    tenantId: run.tenantId,
    targetType: 'checkpoint',
    targetId: run.checkpointId,
    actorId: run.actorId,
    feature: 'checkpoint_grader',
    load: () => loadCheckpointGradingExercise(admin, run.checkpointId, run.tenantId),
    missing: 'The checkpoint no longer exists.',
    toGrade: (exercise, model) => async (content) => {
      const graded = await gradeCheckpointAnswer(exercise, content, model)
      const passingScore = exercise.passingScore
      return {
        score: graded.score,
        passed: graded.score >= passingScore,
        passingScore,
        evaluation: { score: graded.score, feedback: graded.feedback, strengths: [], improvements: graded.next_step_hint ? [graded.next_step_hint] : [] },
      }
    },
  })
}

/**
 * Exam grader run: every case is graded GRADED_REPEATS times by the school's
 * exam grader on the SAVED exam (closed questions exactly, free text by the
 * AI, one model call per repeat); repeats fold into one result row.
 */
async function executeExamRun(
  admin: Admin,
  run: { runId: string; tenantId: string; examId: number; actorId: string | null; locale: string }
) {
  const { runId, tenantId, examId } = run
  let modelCalls = 0

  try {
    const exam = await loadExamGradingContext(admin, { examId, tenantId })
    if (!exam) throw new Error('The exam no longer exists.')

    // A missing key fails here, before any case runs.
    const ai = createTenantAi(tenantId, { actorId: run.actorId })
    const grader = await ai.getModelForFeature('exam_grader')
    await admin
      .from('ai_eval_runs')
      .update({ model_ids: { grader: `${grader.providerId}/${grader.modelId}` } })
      .eq('id', runId)
      .eq('tenant_id', tenantId)

    const { data } = await admin
      .from('ai_eval_cases')
      .select(CASE_COLUMNS)
      .eq('target_type', 'exam')
      .eq('target_id', examId)
      .eq('tenant_id', tenantId)
      .eq('kind', 'graded_exam')
      .order('created_at')
      .limit(EVAL_LIMITS.maxCasesPerTarget)
    const cases = (data ?? []).map((row) => toExamCaseRow(row as Record<string, unknown>))

    const ctx: ExamEngineContext = { grader, exam, locale: run.locale, onModelCall: () => { modelCalls++ } }
    const outcomes: { testCase: ExamCaseRow; outcome: ExamOutcome | null; error?: string }[] = []

    await mapLimit(cases, EVAL_LIMITS.concurrency, async (testCase) => {
      let outcome: ExamOutcome | null = null
      let error: string | undefined
      try {
        outcome = await runExamCase(ctx, testCase)
      } catch (e) {
        error = errorMessage(e)
      }
      const { error: insertError } = await admin.from('ai_eval_results').insert({
        tenant_id: tenantId,
        run_id: runId,
        case_id: testCase.id,
        case_name: testCase.name,
        case_kind: 'graded_exam',
        expected: testCase.expected,
        scores: outcome?.scores ?? null,
        score: outcome?.score ?? null,
        score_stddev: outcome?.score_stddev ?? null,
        output: (outcome?.output ?? null) as never,
        deviation: outcome?.deviation ?? null,
        passed: outcome ? outcome.ok : null,
        error: error ?? null,
      })
      // A result that could not be saved counts as an error, not a silent gap.
      if (insertError) {
        outcome = null
        error = 'Could not save the result.'
      }
      outcomes.push({ testCase, outcome, error })
    })

    const scored = outcomes.filter((o) => o.outcome)
    const summary: ExamRunSummary = {
      total: outcomes.length,
      passed: scored.filter((o) => o.outcome!.ok).length,
      failed: scored.filter((o) => !o.outcome!.ok).length,
      errors: outcomes.length - scored.length,
      inflated_injections: scored.filter((o) => o.outcome!.reasons.includes('inflated')).length,
      pass_flips: scored.filter((o) => o.outcome!.question_flips > 0).length,
      unstable_cases: scored.filter((o) => o.outcome!.output?.questions.some((q) => q.unstable)).length,
      mean_deviation: scored.length ? Math.round(scored.reduce((sum, o) => sum + o.outcome!.deviation, 0) / scored.length) : 0,
      max_stddev: scored.reduce((max, o) => Math.max(max, o.outcome!.score_stddev), 0),
      model_calls: modelCalls,
      question_flips: scored.reduce((sum, o) => sum + o.outcome!.question_flips, 0),
    }

    await admin
      .from('ai_eval_runs')
      .update({ status: 'done', summary, finished_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('tenant_id', tenantId)
  } catch (error) {
    await failRun(admin, runId, tenantId, error, modelCalls)
  }
}

/**
 * Grades every graded_answer case (repeats fold into one result row) and
 * returns the run's graded summary, minus `model_calls` (the caller owns the counter).
 */
async function runGradedCases(
  admin: Admin,
  run: { runId: string; tenantId: string; cases: GradedCaseRow[]; ctx: GradedEngineContext }
): Promise<Omit<GradedRunSummary, 'model_calls'>> {
  const { runId, tenantId, cases, ctx } = run
  const outcomes: { testCase: GradedCaseRow; outcome: GradedOutcome | null; error?: string }[] = []

  await mapLimit(cases, EVAL_LIMITS.concurrency, async (testCase) => {
    let outcome: GradedOutcome | null = null
    let error: string | undefined
    try {
      outcome = await runGradedCase(ctx, testCase)
    } catch (e) {
      error = errorMessage(e)
    }
    const { error: insertError } = await admin.from('ai_eval_results').insert({
      tenant_id: tenantId,
      run_id: runId,
      case_id: testCase.id,
      case_name: testCase.name,
      case_kind: 'graded_answer',
      expected: testCase.expected,
      scores: outcome?.scores ?? null,
      score: outcome?.score ?? null,
      score_stddev: outcome?.score_stddev ?? null,
      output: (outcome?.output ?? null) as never,
      deviation: outcome?.deviation ?? null,
      passed: outcome ? outcome.ok : null,
      error: error ?? null,
    })
    // A result that could not be saved counts as an error, not a silent gap.
    if (insertError) {
      outcome = null
      error = 'Could not save the result.'
    }
    outcomes.push({ testCase, outcome, error })
  })

  const scored = outcomes.filter((o) => o.outcome)
  return {
    total: outcomes.length,
    passed: scored.filter((o) => o.outcome!.ok).length,
    failed: scored.filter((o) => !o.outcome!.ok).length,
    errors: outcomes.length - scored.length,
    inflated_injections: scored.filter((o) => o.outcome!.inflated).length,
    pass_flips: scored.filter((o) => o.outcome!.pass_flip).length,
    unstable_cases: scored.filter((o) => o.outcome!.unstable).length,
    mean_deviation: scored.length ? Math.round(scored.reduce((sum, o) => sum + o.outcome!.deviation, 0) / scored.length) : 0,
    max_stddev: scored.reduce((max, o) => Math.max(max, o.outcome!.score_stddev), 0),
  }
}

async function executeGradedRun(
  admin: Admin,
  run: {
    runId: string
    tenantId: string
    targetType: 'exercise' | 'checkpoint'
    targetId: number
    actorId: string | null
    feature: 'exercise_grader' | 'checkpoint_grader'
    load: () => Promise<(WrittenGradingExercise & { passingScore: number }) | null>
    missing: string
    toGrade?: (exercise: WrittenGradingExercise & { passingScore: number }, model: LanguageModel) => GradedEngineContext['grade']
  }
) {
  const { runId, tenantId, targetType, targetId } = run
  let modelCalls = 0

  try {
    const exercise = await run.load()
    if (!exercise) throw new Error(run.missing)

    // A missing key fails here, before any case runs.
    const ai = createTenantAi(tenantId, { actorId: run.actorId })
    const grader = await ai.getModelForFeature(run.feature)
    await admin
      .from('ai_eval_runs')
      .update({ model_ids: { grader: `${grader.providerId}/${grader.modelId}` } })
      .eq('id', runId)
      .eq('tenant_id', tenantId)

    const { data } = await admin
      .from('ai_eval_cases')
      .select(CASE_COLUMNS)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('tenant_id', tenantId)
      .eq('kind', 'graded_answer')
      .order('created_at')
      .limit(EVAL_LIMITS.maxCasesPerTarget)
    const cases = (data ?? []).map((row) => toGradedCaseRow(row as Record<string, unknown>))

    const ctx: GradedEngineContext = {
      grader: grader.model,
      exercise,
      grade: run.toGrade?.(exercise, grader.model),
      onModelCall: () => { modelCalls++ },
    }
    const summary = { ...(await runGradedCases(admin, { runId, tenantId, cases, ctx })), model_calls: modelCalls }

    await admin
      .from('ai_eval_runs')
      .update({ status: 'done', summary, finished_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('tenant_id', tenantId)
  } catch (error) {
    await failRun(admin, runId, tenantId, error, modelCalls)
  }
}
