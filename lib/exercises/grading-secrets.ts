import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Grading material never sits on the `exercises` row, which any entitled
 * student can SELECT (#509). The `trg_split_exercise_grading_secrets` trigger
 * lifts it into the staff-only `exercise_grading_secrets` on every write:
 *
 * - `questions` — closed-question answer keys (`correctIndex`,
 *   `correctAnswer`, `acceptedAnswers`, `explanation`), keyed by question id (#829)
 * - `config` — the `exercise_config` keys in {@link SECRET_CONFIG_KEYS} (#833)
 * - `system_prompt`, `template_variables` — the columns of the same name (#833)
 *
 * Server code that grades or edits an exercise embeds
 * {@link GRADING_SECRETS_EMBED} (staff under RLS, or the admin client) and
 * merges it back here. Students' clients never can.
 */
export const GRADING_SECRETS_EMBED =
  'exercise_grading_secrets(questions, config, system_prompt, template_variables)'

export const SECRET_CONFIG_KEYS = ['evaluation_criteria', 'rubric', 'expected_keywords', 'system_prompt'] as const

interface GradingSecretsRow {
  questions?: unknown
  config?: unknown
  system_prompt?: string | null
  template_variables?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** The embed as PostgREST returns it: an object for the one-to-one relation, tolerated as an array or null. */
function secretsRow(embed: unknown): GradingSecretsRow | null {
  const row = Array.isArray(embed) ? embed[0] : embed
  return isObject(row) ? (row as GradingSecretsRow) : null
}

/** `exercise_config` with the answer keys and the secret config keys put back. */
export function mergeGradingSecrets(
  config: Record<string, unknown> | null | undefined,
  embed: unknown
): Record<string, unknown> {
  const base = config ?? {}
  const row = secretsRow(embed)
  if (!row) return base

  let merged = base
  if (isObject(row.config) && Object.keys(row.config).length > 0) {
    merged = { ...merged, ...row.config }
  }

  const key = row.questions
  const raw = (merged as { questions?: unknown }).questions
  if (isObject(key) && Array.isArray(raw)) {
    merged = {
      ...merged,
      questions: raw.map((item) => {
        if (!isObject(item)) return item
        const entry = typeof item.id === 'string' ? key[item.id] : undefined
        return isObject(entry) ? { ...item, ...entry } : item
      }),
    }
  }
  return merged
}

type ExerciseLike = {
  exercise_config?: unknown
  system_prompt?: string | null
  template_variables?: unknown
}

/**
 * The exercise row as it was written: config merged, `system_prompt` and
 * `template_variables` restored. `secrets` defaults to the row's own
 * `exercise_grading_secrets` embed, which is dropped from the result.
 */
export function withGradingSecrets<T extends ExerciseLike>(
  exercise: T & { exercise_grading_secrets?: unknown },
  secrets: unknown = exercise.exercise_grading_secrets
): T {
  const row = secretsRow(secrets)
  const out = { ...exercise } as T & { exercise_grading_secrets?: unknown }
  delete out.exercise_grading_secrets
  if ('exercise_config' in exercise) {
    out.exercise_config = mergeGradingSecrets(exercise.exercise_config as Record<string, unknown> | null, row)
  }
  if (row?.system_prompt != null) out.system_prompt = row.system_prompt
  if (row?.template_variables != null) out.template_variables = row.template_variables
  return out
}

/**
 * Read one exercise's secrets on a client that may (staff RLS or the admin
 * client). For routes that fetched the exercise under the student's own token
 * — that token reads nothing here. Call only after access is established.
 */
export async function fetchGradingSecrets(
  client: SupabaseClient,
  exerciseId: number
): Promise<GradingSecretsRow | null> {
  const { data } = await client
    .from('exercise_grading_secrets')
    .select('questions, config, system_prompt, template_variables')
    .eq('exercise_id', exerciseId)
    .maybeSingle()
  return (data as GradingSecretsRow | null) ?? null
}
