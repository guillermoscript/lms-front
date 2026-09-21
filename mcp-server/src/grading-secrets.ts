/**
 * Grading material never sits on the `exercises` row, which students can
 * SELECT. The `trg_split_exercise_grading_secrets` trigger lifts it into the
 * staff-only `exercise_grading_secrets` on every write: closed-question answer
 * keys (`questions`, keyed by question id, #829), the secret
 * `exercise_config` keys (`config`), `system_prompt` and `template_variables`
 * (#833). Staff tools that show or copy a whole exercise embed
 * `GRADING_SECRETS_EMBED` and merge it back here.
 *
 * Mirrors lib/exercises/grading-secrets.ts in the app; this package cannot
 * import from the app.
 */
export const GRADING_SECRETS_EMBED =
  "exercise_grading_secrets(questions, config, system_prompt, template_variables)";

interface GradingSecretsRow {
  questions?: unknown;
  config?: unknown;
  system_prompt?: string | null;
  template_variables?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function secretsRow(embed: unknown): GradingSecretsRow | null {
  const row = Array.isArray(embed) ? embed[0] : embed;
  return isObject(row) ? (row as GradingSecretsRow) : null;
}

/** `exercise_config` with the answer keys and the secret config keys put back. */
export function mergeGradingSecrets(
  config: Record<string, unknown> | null | undefined,
  embed: unknown
): Record<string, unknown> {
  const base = config ?? {};
  const row = secretsRow(embed);
  if (!row) return base;

  let merged = base;
  if (isObject(row.config) && Object.keys(row.config).length > 0) {
    merged = { ...merged, ...row.config };
  }

  const key = row.questions;
  const raw = (merged as { questions?: unknown }).questions;
  if (isObject(key) && Array.isArray(raw)) {
    merged = {
      ...merged,
      questions: raw.map((item) => {
        if (!isObject(item)) return item;
        const entry = typeof item.id === "string" ? key[item.id] : undefined;
        return isObject(entry) ? { ...item, ...entry } : item;
      }),
    };
  }
  return merged;
}

/** The exercise row as it was written; the `exercise_grading_secrets` embed is dropped. */
export function withGradingSecrets<T extends Record<string, unknown>>(
  exercise: T
): Omit<T, "exercise_grading_secrets"> {
  const { exercise_grading_secrets: embed, ...rest } = exercise;
  const row = secretsRow(embed);
  const out: Record<string, unknown> = { ...rest };
  if ("exercise_config" in exercise) {
    out.exercise_config = mergeGradingSecrets(
      exercise.exercise_config as Record<string, unknown> | null,
      row
    );
  }
  if (row?.system_prompt != null) out.system_prompt = row.system_prompt;
  if (row?.template_variables != null) out.template_variables = row.template_variables;
  return out as Omit<T, "exercise_grading_secrets">;
}
