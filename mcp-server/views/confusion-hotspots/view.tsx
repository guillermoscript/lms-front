import { useState } from "react";
import { useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { withWidgetBoundary } from "../shared/error-boundary";
import { type HardestItem, type Hotspot, type Props } from "./schema";
import "virtual:mcp-use/tailwind.css";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Elo baseline every item starts at, so a delta reads as "harder than new". */
const BASELINE_RATING = 1500;

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

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Analysing student results…",
    subtitle: (n: number, s: string) => `Confusion hotspots · last ${s} day${n === 1 ? "" : "s"}`,
    statHotspots: "Hotspots",
    statSevere: "Severe",
    statMislabelled: "Mislabelled",
    calibrationTitle: "Difficulty calibration",
    calibrationBody:
      "Your label vs the rating earned from real attempts. 1500 is where a brand-new item starts; higher means students found it harder.",
    attempts: (n: number, s: string) => `${s} attempt${n === 1 ? "" : "s"}`,
    noLabel: "No label",
    vsNew: (delta: string) => `${delta} vs new`,
    harderThanLabelled: "Harder than labelled",
    easierThanLabelled: "Easier than labelled",
    stuckTitle: "Where students are stuck",
    severeOnlyOn: "✓ Severe only",
    severeOnlyOff: "Show severe only",
    severity: "severity",
    emptySevere: "Nothing at severity 70 or above.",
    emptyNoActivity: (s: string) => `No student activity in the last ${s} days yet.`,
    emptyNoHotspots:
      "No hotspots — nobody is stuck on a drill, exercise or exam question. 🎉",
    truncated: (s: string) => `Showing the worst ${s}; more were found.`,
    basedOn: (
      practice: number,
      practiceStr: string,
      exercise: number,
      exerciseStr: string,
      exam: number,
      examStr: string
    ) =>
      `Based on ${practiceStr} practice attempt${practice === 1 ? "" : "s"}, ${exerciseStr} exercise attempt${exercise === 1 ? "" : "s"} and ${examStr} exam submission${exam === 1 ? "" : "s"}.`,
    scope: {
      practice: "Practice",
      exercise: "Exercise",
      exam_question: "Exam question",
    } as Record<Hotspot["scope"], string>,
    difficulty: { easy: "Easy", medium: "Medium", hard: "Hard" } as Record<
      NonNullable<HardestItem["difficulty_level"]>,
      string
    >,
  },
  es: {
    loading: "Analizando los resultados…",
    subtitle: (n: number, s: string) =>
      `Puntos de confusión · últimos ${s} ${n === 1 ? "día" : "días"}`,
    statHotspots: "Puntos",
    statSevere: "Graves",
    statMislabelled: "Mal etiquetados",
    calibrationTitle: "Calibración de dificultad",
    calibrationBody:
      "Tu etiqueta frente a la valoración ganada con intentos reales. 1500 es donde empieza un ítem nuevo; más alto significa que a los estudiantes les costó más.",
    attempts: (n: number, s: string) => `${s} ${n === 1 ? "intento" : "intentos"}`,
    noLabel: "Sin etiqueta",
    vsNew: (delta: string) => `${delta} frente a nuevo`,
    harderThanLabelled: "Más difícil de lo etiquetado",
    easierThanLabelled: "Más fácil de lo etiquetado",
    stuckTitle: "Dónde se atascan los estudiantes",
    severeOnlyOn: "✓ Solo graves",
    severeOnlyOff: "Ver solo graves",
    severity: "gravedad",
    emptySevere: "Nada con gravedad 70 o superior.",
    emptyNoActivity: (s: string) =>
      `Todavía no hay actividad de estudiantes en los últimos ${s} días.`,
    emptyNoHotspots:
      "Sin puntos de confusión: nadie está atascado en una práctica, un ejercicio ni una pregunta de examen. 🎉",
    truncated: (s: string) => `Mostrando los ${s} peores; se encontraron más.`,
    basedOn: (
      practice: number,
      practiceStr: string,
      exercise: number,
      exerciseStr: string,
      exam: number,
      examStr: string
    ) =>
      `Basado en ${practiceStr} ${practice === 1 ? "intento de práctica" : "intentos de práctica"}, ${exerciseStr} ${exercise === 1 ? "intento de ejercicio" : "intentos de ejercicio"} y ${examStr} ${exam === 1 ? "entrega de examen" : "entregas de examen"}.`,
    scope: {
      practice: "Práctica",
      exercise: "Ejercicio",
      exam_question: "Pregunta de examen",
    } as Record<Hotspot["scope"], string>,
    difficulty: { easy: "Fácil", medium: "Media", hard: "Difícil" } as Record<
      NonNullable<HardestItem["difficulty_level"]>,
      string
    >,
  },
};

// ── Component ───────────────────────────────────────────────────────────────

function ConfusionHotspots() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();
  const [worstOnly, setWorstOnly] = useState(false);

  // "pending" and "error" both render the loading branch, exactly like v1:
  // an isError result carries no structuredContent, and the transcript already
  // shows the tool's own error text.
  if (view.status !== "ready") {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
          </div>
        </div>
      </>
    );
  }

  const { course, window_days, hotspots, hardest_items, truncated, sources } =
    view.toolOutput as Props;

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
    <>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-1">
            <h2 className="m-0 text-[19px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {course.title}
            </h2>
            <div className="mt-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
              {t.subtitle(window_days, fmt.number(window_days))}
            </div>
          </div>

          {/* Summary */}
          <div className="my-3.5 flex w-fit gap-6 rounded-xl border border-zinc-200 bg-white px-[18px] py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
            {stat(t.statHotspots, fmt.number(hotspots.length))}
            {stat(
              t.statSevere,
              fmt.number(severeCount),
              severeCount > 0 ? "text-red-600 dark:text-red-400" : undefined
            )}
            {stat(
              t.statMislabelled,
              fmt.number(mislabeled.length),
              mislabeled.length > 0
                ? "text-amber-600 dark:text-amber-400"
                : undefined
            )}
          </div>

          {/* ── Difficulty calibration ───────────────────────────────────── */}
          {hardest_items.length > 0 && (
            <div className="mb-5">
              <h3 className="m-0 mb-1 text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
                {t.calibrationTitle}
              </h3>
              <p className="m-0 mb-2.5 text-[11.5px] text-zinc-400 dark:text-zinc-500">
                {t.calibrationBody}
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
                          {t.scope[item.item_type]} ·{" "}
                          {t.attempts(item.attempt_count, fmt.number(item.attempt_count))}
                        </div>
                      </div>

                      {/* Declared label */}
                      <div className="shrink-0">
                        <span className="rounded-md border border-zinc-200 px-[7px] py-px text-[10.5px] font-bold text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
                          {item.difficulty_level
                            ? t.difficulty[item.difficulty_level]
                            : t.noLabel}
                        </span>
                      </div>

                      {/* Measured rating */}
                      <div className="min-w-14 shrink-0 text-right">
                        <div className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
                          {fmt.number(item.rating)}
                        </div>
                        <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
                          {t.vsNew(
                            `${delta > 0 ? "+" : ""}${fmt.number(delta)}`
                          )}
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
                              ? t.harderThanLabelled
                              : t.easierThanLabelled}
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
            {t.stuckTitle}
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
              {worstOnly ? t.severeOnlyOn : t.severeOnlyOff}
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
                        {t.scope[h.scope]}
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
                      {fmt.number(h.severity)}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-[3px] bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-[3px] ${tone.bar}`}
                        style={{ width: `${h.severity}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-400 uppercase dark:text-zinc-500">
                      {t.severity}
                    </div>
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && (
              <p className="m-0 p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                {worstOnly
                  ? t.emptySevere
                  : totalSignals === 0
                    ? t.emptyNoActivity(fmt.number(window_days))
                    : t.emptyNoHotspots}
              </p>
            )}
          </div>

          {truncated && (
            <p className="m-0 mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
              {t.truncated(fmt.number(hotspots.length))}
            </p>
          )}

          <p className="m-0 mt-3.5 border-t border-zinc-200 pt-3 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            {t.basedOn(
              sources.practice_attempts,
              fmt.number(sources.practice_attempts),
              sources.exercise_evaluations,
              fmt.number(sources.exercise_evaluations),
              sources.exam_submissions,
              fmt.number(sources.exam_submissions)
            )}
          </p>
        </div>
      </div>
    </>
  );
}

export default withWidgetBoundary(ConfusionHotspots);
