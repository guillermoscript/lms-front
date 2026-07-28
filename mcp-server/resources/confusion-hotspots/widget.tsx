import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const hotspotSchema = z.object({
  scope: z.enum(["practice", "exercise", "exam_question"]),
  ref: z.union([z.number(), z.string()]).nullable(),
  label: z.string(),
  students_affected: z.number(),
  severity: z.number(),
  evidence: z.string(),
});

const hardestItemSchema = z.object({
  item_type: z.enum(["exercise", "exam_question"]),
  item_id: z.number(),
  title: z.string(),
  rating: z.number(),
  attempt_count: z.number(),
  /** The teacher's own label. Always null for exam questions, which have none. */
  difficulty_level: z.enum(["easy", "medium", "hard"]).nullable(),
  /** Set only when the measured rating contradicts `difficulty_level`. */
  mismatch: z.enum(["harder_than_labeled", "easier_than_labeled"]).nullable(),
});

const propsSchema = z.object({
  course: z.object({ id: z.number(), title: z.string() }),
  window_days: z.number(),
  hotspots: z.array(hotspotSchema),
  hardest_items: z.array(hardestItemSchema),
  truncated: z.boolean(),
  sources: z.object({
    practice_attempts: z.number(),
    exercise_evaluations: z.number(),
    exam_submissions: z.number(),
  }),
  /**
   * Kept in the payload for the model's benefit even though nothing here
   * renders it — it explains how `severity` was derived, which the model needs
   * to reason about the ranking it is shown.
   */
  severity_formula: z.string(),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Where a course's students collectively struggle: practice topics, exercises and exam questions ranked by severity, plus the hardest items by measured Elo rating and whether that contradicts the teacher's own difficulty label.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Analysing student results…",
    invoked: "Hotspots ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type Hotspot = z.infer<typeof hotspotSchema>;
type HardestItem = z.infer<typeof hardestItemSchema>;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Elo baseline every item starts at, so a delta reads as "harder than new". */
const BASELINE_RATING = 1500;

const SCOPE_LABEL: Record<Hotspot["scope"], string> = {
  practice: "Practice",
  exercise: "Exercise",
  exam_question: "Exam question",
};

const DIFFICULTY_LABEL: Record<
  NonNullable<HardestItem["difficulty_level"]>,
  string
> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/**
 * Severity colours are a fixed diagnostic scale, deliberately not the tenant
 * brand colour — "most of the class is failing this" must look the same in
 * every school.
 */
function severityTone(severity: number): { bar: string; text: string } {
  if (severity >= 70)
    return {
      bar: "bg-red-600 dark:bg-red-400",
      text: "text-red-600 dark:text-red-400",
    };
  if (severity >= 40)
    return {
      bar: "bg-amber-500 dark:bg-amber-400",
      text: "text-amber-600 dark:text-amber-400",
    };
  return {
    bar: "bg-zinc-400 dark:bg-zinc-500",
    text: "text-zinc-500 dark:text-zinc-400",
  };
}

function scopeChip(scope: Hotspot["scope"]): string {
  if (scope === "exam_question")
    return "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300";
  if (scope === "exercise")
    return "bg-[var(--brand-50)] text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]";
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ConfusionHotspots() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const [worstOnly, setWorstOnly] = useState(false);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">Analysing student results…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { course, window_days, hotspots, hardest_items, truncated, sources } =
    props;

  const visible = worstOnly
    ? hotspots.filter((h) => h.severity >= 70)
    : hotspots;
  const severeCount = hotspots.filter((h) => h.severity >= 70).length;
  const mislabeled = hardest_items.filter((i) => i.mismatch !== null);
  const totalSignals =
    sources.practice_attempts +
    sources.exercise_evaluations +
    sources.exam_submissions;

  const stat = (label: string, value: string, accentClass?: string) => (
    <div className="text-center">
      <div
        className={`text-xl font-bold ${
          accentClass ?? "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        {label}
      </div>
    </div>
  );

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-1">
            <h2 className="m-0 text-[19px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {course.title}
            </h2>
            <div className="mt-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
              Confusion hotspots · last {window_days} day
              {window_days === 1 ? "" : "s"}
            </div>
          </div>

          {/* Summary */}
          <div className="my-3.5 flex w-fit gap-6 rounded-xl border border-zinc-200 bg-white px-[18px] py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
            {stat("Hotspots", String(hotspots.length))}
            {stat(
              "Severe",
              String(severeCount),
              severeCount > 0 ? "text-red-600 dark:text-red-400" : undefined
            )}
            {stat(
              "Mislabelled",
              String(mislabeled.length),
              mislabeled.length > 0
                ? "text-amber-600 dark:text-amber-400"
                : undefined
            )}
          </div>

          {/* ── Difficulty calibration ───────────────────────────────────── */}
          {hardest_items.length > 0 && (
            <div className="mb-5">
              <h3 className="m-0 mb-1 text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
                Difficulty calibration
              </h3>
              <p className="m-0 mb-2.5 text-[11.5px] text-zinc-400 dark:text-zinc-500">
                Your label vs the rating earned from real attempts. 1500 is where
                a brand-new item starts; higher means students found it harder.
              </p>
              <div className="flex flex-col gap-1.5">
                {hardest_items.map((item: HardestItem) => {
                  const delta = item.rating - BASELINE_RATING;
                  return (
                    <div
                      key={`${item.item_type}-${item.item_id}`}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 dark:bg-zinc-900 ${
                        item.mismatch
                          ? "border-amber-200 dark:border-amber-900"
                          : "border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <div className="min-w-40 flex-1">
                        <div className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                          {SCOPE_LABEL[item.item_type]} · {item.attempt_count}{" "}
                          attempt{item.attempt_count === 1 ? "" : "s"}
                        </div>
                      </div>

                      {/* Declared label */}
                      <div className="shrink-0">
                        <span className="rounded-md border border-zinc-200 px-[7px] py-px text-[10.5px] font-bold text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
                          {item.difficulty_level
                            ? DIFFICULTY_LABEL[item.difficulty_level]
                            : "No label"}
                        </span>
                      </div>

                      {/* Measured rating */}
                      <div className="min-w-14 shrink-0 text-right">
                        <div className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
                          {item.rating}
                        </div>
                        <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
                          {delta > 0 ? `+${delta}` : delta} vs new
                        </div>
                      </div>

                      {/* Verdict */}
                      <div className="min-w-28 shrink-0 text-right">
                        {item.mismatch && (
                          <span
                            className={`rounded-md px-[7px] py-px text-[10.5px] font-bold ${
                              item.mismatch === "harder_than_labeled"
                                ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {item.mismatch === "harder_than_labeled"
                              ? "Harder than labelled"
                              : "Easier than labelled"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Hotspots ─────────────────────────────────────────────────── */}
          <h3 className="m-0 mb-2.5 text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
            Where students are stuck
          </h3>

          {severeCount > 0 && (
            <button
              onClick={() => setWorstOnly((v) => !v)}
              className={`mb-3 cursor-pointer rounded-lg border px-3.5 py-1.5 text-[12.5px] font-medium ${
                worstOnly
                  ? "border-red-600 bg-red-50 text-red-600 dark:border-red-400 dark:bg-red-950 dark:text-red-400"
                  : "border-zinc-200 bg-transparent text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
              }`}
            >
              {worstOnly ? "✓ Severe only" : "Show severe only"}
            </button>
          )}

          <div className="flex flex-col gap-2">
            {visible.map((h: Hotspot) => {
              const tone = severityTone(h.severity);
              return (
                <div
                  key={`${h.scope}-${String(h.ref)}`}
                  className="flex flex-wrap items-center gap-3.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-40 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`shrink-0 rounded-md px-[7px] py-px text-[10.5px] font-bold uppercase ${scopeChip(h.scope)}`}
                      >
                        {SCOPE_LABEL[h.scope]}
                      </span>
                      <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                        {h.label}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-zinc-400 dark:text-zinc-500">
                      {h.evidence}
                    </div>
                  </div>

                  <div className="min-w-24 shrink-0 text-right">
                    <div className={`text-sm font-bold ${tone.text}`}>
                      {h.severity}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-[3px] bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-[3px] ${tone.bar}`}
                        style={{ width: `${h.severity}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-400 uppercase dark:text-zinc-500">
                      severity
                    </div>
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && (
              <p className="m-0 p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                {worstOnly
                  ? "Nothing at severity 70 or above."
                  : totalSignals === 0
                    ? `No student activity in the last ${window_days} days yet.`
                    : "No hotspots — nobody is stuck on a drill, exercise or exam question. 🎉"}
              </p>
            )}
          </div>

          {truncated && (
            <p className="m-0 mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
              Showing the worst {hotspots.length}; more were found.
            </p>
          )}

          <p className="m-0 mt-3.5 border-t border-zinc-200 pt-3 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            Based on {sources.practice_attempts} practice attempt
            {sources.practice_attempts === 1 ? "" : "s"},{" "}
            {sources.exercise_evaluations} exercise attempt
            {sources.exercise_evaluations === 1 ? "" : "s"} and{" "}
            {sources.exam_submissions} exam submission
            {sources.exam_submissions === 1 ? "" : "s"}.
          </p>
        </div>
      </div>
    </McpUseProvider>
  );
}
