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
