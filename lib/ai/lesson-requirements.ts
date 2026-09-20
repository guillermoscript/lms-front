import { z } from 'zod'

/**
 * Structured AI-task requirements (#806) — the fields a teacher fills instead
 * of writing the tutor's whole brief as free text.
 *
 * `lessons_ai_tasks.requirements` is nullable: NULL keeps today's free-text
 * behavior (`task_instructions` + `system_prompt`, see `PROMPTS.lessonTutor`).
 * A valid object switches the tutor prompt to the platform-assembled one
 * built from these fields (`buildStructuredTutorPrompt` in `lib/ai/prompts.ts`)
 * and turns on the `reportProgress` tool + per-requirement completion checks
 * (`lib/ai/lesson-completion-verifier.ts`).
 *
 * One schema, three consumers: the teacher form, the prompt assembler, and
 * the verifier — so a field can never drift out of sync between them.
 */
export const requirementSchema = z.object({
    id: z.string().min(1),
    text: z.string().min(1),
})

export type Requirement = z.infer<typeof requirementSchema>

// Owner decision (#806): per-task minimum student turns, default 4. The
// completion verifier refuses below it; a teacher may set 0 to allow a valid
// one-shot answer in the student's very first message.
export const DEFAULT_MIN_STUDENT_TURNS = 4

export const structuredRequirementsSchema = z.object({
    level: z.string().min(1),
    scenario: z.string().min(1),
    tutor_role: z.string().min(1),
    requirements: z.array(requirementSchema).min(1),
    closing_phase: z.string().trim().min(1).optional(),
    min_student_turns: z.number().int().min(0).default(DEFAULT_MIN_STUDENT_TURNS),
})

export type StructuredRequirements = z.infer<typeof structuredRequirementsSchema>

/**
 * Parses whatever is stored in `lessons_ai_tasks.requirements`. NULL, or a
 * value that fails validation, both fall back to free-text mode — this never
 * throws, since it reads rows written by any past shape of the column.
 */
export function parseStructuredRequirements(value: unknown): StructuredRequirements | null {
    if (value === null || value === undefined) return null
    const result = structuredRequirementsSchema.safeParse(value)
    return result.success ? result.data : null
}

/** The ordered ids a `StructuredRequirements` carries, for the `reportProgress` tool and the student's progress bar. */
export function requirementIds(structured: StructuredRequirements | null | undefined): string[] {
    return structured?.requirements.map((r) => r.id) ?? []
}

/** A fresh, empty requirement row for the teacher form's "add" button. */
export function newRequirement(id: string): Requirement {
    return { id, text: '' }
}

/** Student-facing task text assembled from a structured config — a plain fallback for cards/screens that display `task_instructions`, kept separate from the tutor's own system prompt. */
export function structuredRequirementsSummary(structured: StructuredRequirements): string {
    const list = structured.requirements.map((requirement, index) => `${index + 1}. ${requirement.text}`).join('\n')
    return [structured.scenario, '', list, ...(structured.closing_phase ? ['', structured.closing_phase] : [])].join('\n')
}

export const REPORT_PROGRESS_PART = 'tool-reportProgress'

interface ProgressToolPartLike {
    type: string
    state?: string
    output?: unknown
}

/**
 * The requirement ids the tutor last reported met, from the newest
 * `reportProgress` call the tool has answered — read straight off the chat's
 * own messages the same way `findLessonCompletion` reads `markLessonCompleted`.
 */
export function latestReportedProgress(
    messages: { role: string; parts: ProgressToolPartLike[] }[]
): string[] {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i]
        if (message.role !== 'assistant') continue
        for (let j = message.parts.length - 1; j >= 0; j--) {
            const part = message.parts[j]
            if (part.type === REPORT_PROGRESS_PART && part.state === 'output-available') {
                const output = (part.output ?? {}) as { met?: string[] }
                return output.met ?? []
            }
        }
    }
    return []
}
