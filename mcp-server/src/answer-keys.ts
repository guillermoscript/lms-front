/**
 * Closed-question answer keys (#829). The `exercises_split_answer_key` trigger
 * moves `correctIndex` / `correctAnswer` / `acceptedAnswers` / `explanation`
 * out of `exercise_config.questions[]` into `exercise_answer_keys.questions`
 * (keyed by question id), because students can SELECT the exercise row. Staff
 * tools that copy or show a whole question set merge the key back here.
 *
 * Mirrors `mergeAnswerKey` in the app's lib/checkpoints/types.ts; this package
 * cannot import from the app.
 */
export function mergeAnswerKey(
  config: Record<string, unknown> | null | undefined,
  keyRow: unknown
): Record<string, unknown> {
  const base = config ?? {};
  const row = Array.isArray(keyRow) ? keyRow[0] : keyRow;
  const key = (row as { questions?: unknown } | null | undefined)?.questions;
  const raw = (base as { questions?: unknown }).questions;
  if (!key || typeof key !== "object" || Array.isArray(key) || !Array.isArray(raw)) {
    return base;
  }
  const entries = key as Record<string, unknown>;
  return {
    ...base,
    questions: raw.map((item) => {
      if (!item || typeof item !== "object") return item;
      const id = (item as { id?: unknown }).id;
      const entry = typeof id === "string" ? entries[id] : undefined;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return item;
      return { ...(item as Record<string, unknown>), ...(entry as Record<string, unknown>) };
    }),
  };
}
