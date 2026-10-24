// Coach and voice scenario evals (F4). Case, output and summary types come from
// `lib/ai/evals/schema.ts`; only UI-side helpers live here.

import { GRADED_REPEATS } from './types'
import type { CoachCaseRow, CoachOutput, CriterionVerdict, TranscriptMessage, VoiceCaseRow, VoiceOutput } from '@/lib/ai/evals/schema'

export type ScenarioSurface = 'coach' | 'voice'
export type ScenarioKind = 'coach_scenario' | 'voice_scenario'

export const SURFACE_KIND: Record<ScenarioSurface, ScenarioKind> = {
  coach: 'coach_scenario',
  voice: 'voice_scenario',
}

export const SCENARIO_LIMITS = {
  coachScript: 5,
  voiceScript: 10,
  maxTurns: 10,
  defaultMaxTurns: 8,
} as const

export type {
  CoachCaseRow,
  CoachOutput,
  CoachReason,
  ScenarioRunSummary,
  VoiceCaseRow,
  VoiceEvaluation,
  VoiceExpected,
  VoiceInput,
  VoiceOutcome,
  VoiceOutput,
  VoiceReason,
} from '@/lib/ai/evals/schema'

export type ScenarioCaseRow = CoachCaseRow | VoiceCaseRow

/** Any case row of an exercise, as `GET exercise/[id]/cases` returns it (kinds mixed). */
export interface AnyCaseRow {
  id: string
  kind: string
  input?: { max_turns?: number } | null
}

/** Result row of a coach or voice case, as GET /runs/[runId] returns it. */
export interface ScenarioResultRow {
  id: string
  case_id: string | null
  case_name: string
  case_kind: string
  expected?: unknown
  transcript: TranscriptMessage[] | null
  completed: boolean | null
  completed_turn: number | null
  verdicts: CriterionVerdict[] | null
  deviation: number | null
  passed: boolean | null
  score?: number | null
  scores?: number[] | null
  output: CoachOutput | VoiceOutput | null
  error: string | null
}

export function isScenarioKind(kind: string | null | undefined): kind is ScenarioKind {
  return kind === 'coach_scenario' || kind === 'voice_scenario'
}

export interface CaseCounts {
  graded: number
  coach: number
  voice: number
  calls: number
}

/** Same arithmetic as the server's `estimated_model_calls`: graded*3 + coach (2*turns+1) + voice (2*turns+2). */
export function countCases(cases: AnyCaseRow[]): CaseCounts {
  const counts: CaseCounts = { graded: 0, coach: 0, voice: 0, calls: 0 }
  for (const c of cases) {
    const turns = Math.min(SCENARIO_LIMITS.maxTurns, Math.max(1, c.input?.max_turns ?? SCENARIO_LIMITS.defaultMaxTurns))
    if (c.kind === 'coach_scenario') {
      counts.coach += 1
      counts.calls += 2 * turns + 1
    } else if (c.kind === 'voice_scenario') {
      counts.voice += 1
      counts.calls += 2 * turns + 2
    } else {
      counts.graded += 1
      counts.calls += GRADED_REPEATS
    }
  }
  return counts
}
