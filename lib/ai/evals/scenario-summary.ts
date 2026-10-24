import { GRADED_REPEATS, type CoachCaseRow, type GradedCaseRow, type ScenarioRunSummary, type VoiceCaseRow } from './schema'

/** Pure helpers for exercise runs that mix graded answers, coach scenarios and voice scenarios. */

export interface ExerciseCasePartition {
  graded: GradedCaseRow[]
  coach: CoachCaseRow[]
  voice: VoiceCaseRow[]
}

/** Splits an exercise's cases by kind; any other kind (stale or foreign) is ignored. */
export function partitionExerciseCases(rows: { kind: string }[]): ExerciseCasePartition {
  const out: ExerciseCasePartition = { graded: [], coach: [], voice: [] }
  for (const row of rows) {
    if (row.kind === 'graded_answer') out.graded.push(row as GradedCaseRow)
    else if (row.kind === 'coach_scenario') out.coach.push(row as CoachCaseRow)
    else if (row.kind === 'voice_scenario') out.voice.push(row as VoiceCaseRow)
  }
  return out
}

/**
 * Model requests one run makes: graded x repeats, coach 2 per turn plus the
 * judge, voice 2 per turn plus the opening, grader and judge.
 */
export function estimateExerciseModelCalls(cases: { kind: string; input?: unknown }[]): number {
  let total = 0
  for (const c of cases) {
    const maxTurns = Number((c.input as { max_turns?: unknown } | null)?.max_turns)
    const turns = Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : 8
    if (c.kind === 'graded_answer') total += GRADED_REPEATS
    else if (c.kind === 'coach_scenario') total += 2 * turns + 1
    else if (c.kind === 'voice_scenario') total += 2 * turns + 2
  }
  return total
}

export interface ScenarioItem {
  kind: 'coach_scenario' | 'voice_scenario'
  /** null = the case errored (no outcome). */
  outcome: { passed: boolean; deviation: number; reasons: string[] } | null
}

/**
 * `summary.scenario` of a run. `verdict_changes` counts scored cases whose
 * headline outcome differed from the expectation (coach: unexpected_completion
 * or no_completion; voice: finish_mismatch or pass_mismatch).
 */
export function summarizeScenarioItems(items: ScenarioItem[]): ScenarioRunSummary {
  const scored = items.filter((i) => i.outcome)
  const has = (i: ScenarioItem, ...reasons: string[]) => reasons.some((r) => i.outcome!.reasons.includes(r))
  return {
    total: items.length,
    passed: scored.filter((i) => i.outcome!.passed).length,
    failed: scored.filter((i) => !i.outcome!.passed).length,
    errored: items.length - scored.length,
    unexpected_completions: scored.filter((i) => i.kind === 'coach_scenario' && has(i, 'unexpected_completion')).length,
    verdict_changes: scored.filter((i) =>
      i.kind === 'coach_scenario' ? has(i, 'unexpected_completion', 'no_completion') : has(i, 'finish_mismatch', 'pass_mismatch')
    ).length,
    avg_deviation: scored.length ? Math.round(scored.reduce((sum, i) => sum + i.outcome!.deviation, 0) / scored.length) : 0,
  }
}
