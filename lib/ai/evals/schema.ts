import { z } from 'zod'
import { structuredRequirementsSchema } from '@/lib/ai/lesson-requirements'

/**
 * AI task tests (docs/plans/AI_EVALS_AND_SCENARIOS.md), F1: lesson AI tasks.
 *
 * A case is either a golden chat (a conversation the teacher saved from the
 * preview or a real student chat, replayed against a new version) or a
 * scenario (a simulated student). Runs execute every case of a target against
 * one prompt version.
 */

export const EVAL_LIMITS = {
  maxCasesPerTarget: 20,
  maxTurns: 10,
  maxGoldenMessages: 40,
  maxMessageChars: 4000,
  maxCriteria: 8,
  /** Cases run in parallel inside one run. */
  concurrency: 2,
  runsPerTenantPerDay: 40,
} as const

export const transcriptMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(EVAL_LIMITS.maxMessageChars),
})
export type TranscriptMessage = z.infer<typeof transcriptMessageSchema>

/** `completed: null` = either outcome is acceptable. */
export const expectedSchema = z.object({
  completed: z.boolean().nullable().default(null),
})
export type EvalExpected = z.infer<typeof expectedSchema>

export const mustKeepSchema = z
  .array(z.string().trim().min(1).max(300))
  .max(EVAL_LIMITS.maxCriteria)

export const goldenInputSchema = z.object({
  messages: z
    .array(transcriptMessageSchema)
    .min(2)
    .max(EVAL_LIMITS.maxGoldenMessages)
    // Replay needs student turns; the judge compares against tutor turns.
    .refine((m) => m.some((x) => x.role === 'user') && m.some((x) => x.role === 'assistant'), {
      message: 'A golden needs at least one student message and one tutor reply',
    }),
})
export type GoldenInput = z.infer<typeof goldenInputSchema>

export const scenarioInputSchema = z.object({
  persona: z.string().trim().min(1).max(1000),
  goal: z.string().trim().max(1000).default(''),
  /** Fixed first student messages, sent before the simulator takes over. */
  script: z.array(z.string().trim().min(1).max(EVAL_LIMITS.maxMessageChars)).max(5).default([]),
  max_turns: z.number().int().min(1).max(EVAL_LIMITS.maxTurns).default(8),
})
export type ScenarioInput = z.infer<typeof scenarioInputSchema>

/** What a golden chat produced when it was saved. */
export const goldenOutputSchema = z.object({
  completed: z.boolean(),
  completed_turn: z.number().int().nullable(),
  version_id: z.string().uuid().nullable().optional(),
})
export type GoldenOutput = z.infer<typeof goldenOutputSchema>

const caseBase = {
  name: z.string().trim().min(1).max(200),
  importance_note: z.string().trim().max(2000).nullable().optional(),
  expected: expectedSchema.default({ completed: null }),
  must_keep: mustKeepSchema.default([]),
}

export const createCaseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('golden_chat'),
    // teacher = written by hand or through MCP rather than saved from a chat.
    source: z.enum(['preview', 'real_chat', 'teacher']).default('preview'),
    ...caseBase,
    input: goldenInputSchema,
  }),
  z.object({
    kind: z.literal('scenario'),
    ...caseBase,
    input: scenarioInputSchema,
  }),
])
export type CreateCaseInput = z.infer<typeof createCaseSchema>

export const updateCaseSchema = z.object({
  name: caseBase.name.optional(),
  importance_note: caseBase.importance_note,
  expected: expectedSchema.optional(),
  must_keep: mustKeepSchema.optional(),
  /** Scenarios only; golden transcripts are never edited. */
  scenario: scenarioInputSchema.optional(),
})
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>

/** The editor's unsaved task config, same fields the preview route takes. */
export const draftConfigSchema = z.object({
  task_instructions: z.string().max(20000).optional(),
  system_prompt: z.string().max(20000).optional(),
  requirements: structuredRequirementsSchema.nullable().optional(),
})
export type DraftConfig = z.infer<typeof draftConfigSchema>

export const goldenOutputInputSchema = z.object({
  completed: z.boolean(),
  completed_turn: z.number().int().min(1).max(100).nullable().optional(),
})

export const verdictSchema = z.object({
  criterion: z.string(),
  passed: z.boolean(),
  evidence: z.string(),
})
export type CriterionVerdict = z.infer<typeof verdictSchema>

export interface EvalCaseRow {
  id: string
  kind: 'golden_chat' | 'scenario'
  source: string
  name: string
  importance_note: string | null
  expected: EvalExpected
  must_keep: string[]
  input: GoldenInput | ScenarioInput
  golden_output: GoldenOutput | null
  generated_for_version_id: string | null
  teacher_edited: boolean
}

export interface CaseOutcome {
  transcript: TranscriptMessage[]
  completed: boolean
  /** Student turn (1-based) at which the verifier accepted completion. */
  completed_turn: number | null
  verdicts: CriterionVerdict[]
  deviation: number
  passed: boolean
  error?: string
}

export interface RunSummary {
  total: number
  passed: number
  failed: number
  errored: number
  verdict_changes: number
  avg_deviation: number
  model_calls: number
  regenerated_scenarios: number
}

// ---------------------------------------------------------------------------
// F2: graded answers for AI-graded exercises
// ---------------------------------------------------------------------------

/** Exercise types whose grading the tests can exercise (essay/code via evaluateWrittenExercise, artifact via evaluateArtifactExercise). */
export const GRADED_EVAL_EXERCISE_TYPES = ['essay', 'discussion', 'coding_challenge', 'artifact'] as const
export type GradedEvalExerciseType = (typeof GRADED_EVAL_EXERCISE_TYPES)[number]

export function isGradedEvalExerciseType(type: string): type is GradedEvalExerciseType {
  return (GRADED_EVAL_EXERCISE_TYPES as readonly string[]).includes(type)
}

/** Each case is graded this many times; the median is judged. */
export const GRADED_REPEATS = 3

export const GRADED_CATEGORIES = [
  'high',
  'mid',
  'low',
  'boundary',
  'injection',
  'keyword_stuffing',
  'off_topic',
  'short_correct',
  'custom',
] as const
export type GradedCategory = (typeof GRADED_CATEGORIES)[number]

export const GRADED_CONTENT_MAX = 20000
export const DEFAULT_GRADED_TOLERANCE = 10
/** Serialized size cap on artifact metadata (same as the preview route). */
export const GRADED_METADATA_MAX = 10_000

export const gradedInputSchema = z.object({
  content: z.string().min(1).max(GRADED_CONTENT_MAX),
  /** Artifact exercises pass their metadata through to the grader. */
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((m) => m === undefined || JSON.stringify(m).length <= GRADED_METADATA_MAX, 'metadata too large'),
})
export type GradedInput = z.infer<typeof gradedInputSchema>

export const gradedExpectedSchema = z.object({
  score: z.number().int().min(0).max(100),
  tolerance: z.number().int().min(0).max(50).default(DEFAULT_GRADED_TOLERANCE),
  /** null = derive from score >= passing score. */
  passed: z.boolean().nullable().default(null),
  category: z.enum(GRADED_CATEGORIES).optional(),
})
export type GradedExpected = z.infer<typeof gradedExpectedSchema>

export const gradedGoldenOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  feedback: z.string().max(10000).default(''),
})
export type GradedGoldenOutput = z.infer<typeof gradedGoldenOutputSchema>

export const createGradedCaseSchema = z.object({
  kind: z.literal('graded_answer'),
  source: z.enum(['preview', 'teacher']).default('teacher'),
  name: caseBase.name,
  importance_note: caseBase.importance_note,
  input: gradedInputSchema,
  expected: gradedExpectedSchema,
  golden_output: gradedGoldenOutputSchema.optional(),
})
export type CreateGradedCaseInput = z.infer<typeof createGradedCaseSchema>

export const updateGradedCaseSchema = z.object({
  name: caseBase.name.optional(),
  importance_note: caseBase.importance_note,
  input: z.object({ content: z.string().min(1).max(GRADED_CONTENT_MAX) }).optional(),
  expected: z
    .object({
      score: z.number().int().min(0).max(100).optional(),
      tolerance: z.number().int().min(0).max(50).optional(),
      passed: z.boolean().nullable().optional(),
      category: z.enum(GRADED_CATEGORIES).optional(),
    })
    .optional(),
})
export type UpdateGradedCaseInput = z.infer<typeof updateGradedCaseSchema>

/** A graded_answer row as the cases routes return it. */
export interface GradedCaseRow {
  id: string
  kind: 'graded_answer'
  source: 'preview' | 'generated' | 'teacher'
  name: string
  importance_note: string | null
  expected: GradedExpected
  input: GradedInput
  golden_output: GradedGoldenOutput | null
  generated_for_version_id: string | null
  teacher_edited: boolean
  created_at?: string
  updated_at?: string
}

export type GradedReason = 'out_of_tolerance' | 'pass_flip' | 'inflated'

/** What the median repeat produced, plus the verdict details stored with it. */
export interface GradedOutput {
  feedback: string
  strengths: string[]
  improvements: string[]
  /** The median repeat's own pass/fail. */
  passed: boolean
  /** Why the case failed ([] when it met its expectation). */
  reasons?: GradedReason[]
  /** Per-repeat pass/fail. */
  passed_flags?: boolean[]
  /** Majority verdict of the repeats. */
  majority_passed?: boolean
  /** The exercise's passing score the verdict was judged against. */
  passing_score?: number
  /** Some repeat disagreed with the expected pass/fail but the majority was right. */
  unstable?: boolean
}

export interface GradedOutcome {
  /** One per repeat that graded; shorter than GRADED_REPEATS when some repeats errored. */
  scores: number[]
  /** Median of scores. */
  score: number
  /** Population standard deviation of scores. */
  score_stddev: number
  passed_flags: boolean[]
  /** Majority verdict of the repeats. */
  passed: boolean
  deviation: number
  /** The majority verdict differs from the expected pass/fail. */
  pass_flip: boolean
  /** Some repeat disagreed with the expected pass/fail, but the majority was right. */
  unstable: boolean
  passing_score: number
  /** Injection case where a repeat scored above the expected score. */
  inflated: boolean
  /** Whether the case as a whole meets its expectation. */
  ok: boolean
  /** Why it failed, for the report. */
  reasons: GradedReason[]
  output: GradedOutput | null
  error?: string
}

/** Result row of a graded run, as GET /runs/[runId] returns it. */
export interface GradedResultRow {
  id: string
  case_id: string | null
  case_name: string
  case_kind: string
  expected: GradedExpected
  scores: number[] | null
  score: number | null
  score_stddev: number | null
  output: GradedOutput | null
  deviation: number | null
  passed: boolean | null
  error: string | null
  created_at: string
}

export interface GradedRunSummary {
  total: number
  passed: number
  failed: number
  errors: number
  inflated_injections: number
  /** Cases whose majority verdict differs from the expected pass/fail. */
  pass_flips: number
  /** Cases where some repeat disagreed but the majority was right. */
  unstable_cases: number
  mean_deviation: number
  max_stddev: number
  model_calls: number
}
