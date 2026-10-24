import type { CriterionVerdict, EvalExpected, GoldenOutput } from './schema'

/** Deviation at or above this marks a case as "drifted" in the report. */
export const DRIFT_THRESHOLD = 30

/**
 * How far a result moved from what the teacher expects, 0–100.
 *
 * Outcome first: a wrong completed/not-completed is most of the score, since
 * that is what students feel. Then failed criteria, then a turn shift against
 * the golden (completing much later or earlier is a smaller change).
 */
export function computeDeviation(input: {
  completed: boolean
  completedTurn: number | null
  expected: EvalExpected
  golden: GoldenOutput | null
  verdicts: CriterionVerdict[]
}): { deviation: number; passed: boolean; verdictChanged: boolean } {
  const expectedOk = input.expected.completed === null || input.expected.completed === input.completed
  const verdictChanged = input.golden !== null && input.golden.completed !== input.completed

  let deviation = 0
  if (!expectedOk || verdictChanged) deviation += 60

  const failed = input.verdicts.filter((v) => !v.passed).length
  if (input.verdicts.length > 0) deviation += Math.round((40 * failed) / input.verdicts.length)

  if (
    input.golden?.completed &&
    input.completed &&
    input.golden.completed_turn !== null &&
    input.completedTurn !== null
  ) {
    deviation += Math.min(20, Math.abs(input.completedTurn - input.golden.completed_turn) * 5)
  }

  deviation = Math.max(0, Math.min(100, deviation))
  return { deviation, passed: expectedOk && failed === 0, verdictChanged }
}
