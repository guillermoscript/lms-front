import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { z } from "zod";

// Props produced by lms_get_study_plan (Epic #348 Phase 4, #359).
const propsSchema = z.object({
  week_start: z.string().describe("Monday of the plan's week, YYYY-MM-DD"),
  goals: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      kind: z.enum(["lesson", "practice", "review", "exam_prep", "custom"]),
      course_id: z.number().nullable(),
      // Required goals gate week completion; optional for payloads predating #391.
      required: z.boolean().optional(),
      done: z.boolean(),
      done_at: z.string().nullable(),
    })
  ),
  progress: z.number().describe("Percent of goals done, 0-100"),
  context: z.object({
    next_lessons: z.array(
      z.object({
        course_id: z.number(),
        course_title: z.string(),
        lesson_id: z.number(),
        lesson_title: z.string(),
      })
    ),
    due_reviews: z.number(),
  }),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Weekly study plan: progress ring, goal checklist grouped by kind with check-off, planning context (next lessons, due flashcards), and a plan-next-week action.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading your study plan...",
    invoked: "Study plan ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type Goal = Props["goals"][number];

const KIND_ICON: Record<Goal["kind"], string> = {
  lesson: "📖",
  practice: "✏️",
  review: "🔁",
  exam_prep: "📄",
  custom: "🎯",
};
const KIND_ORDER: Goal["kind"][] = ["lesson", "practice", "review", "exam_prep", "custom"];

const STRINGS = {
  en: {
    kinds: {
      lesson: "Lessons",
      practice: "Practice",
      review: "Review",
      exam_prep: "Exam prep",
      custom: "Other",
    } as Record<Goal["kind"], string>,
    weekOf: (d: string) => `Week of ${d}`,
    noGoals: "No goals yet this week",
    goalsDone: (done: string, total: string) => `${done} of ${total} goals done`,
    requiredLeft: (n: string) => ` · ${n} required left`,
    flashcardsDue: (n: string) => ` · ${n} flashcards due`,
    weekCompleteAll: "Week complete — every goal done!",
    weekCompleteRequired: "Week complete — all required goals done!",
    saveError: "Could not save that goal — it has been unchecked. Try again.",
    nothingPlanned: "Nothing planned yet",
    upNext: "Up next",
    openLesson: "Open",
    planWeek: "Plan my week",
    required: "Required",
    planNextWeek: "Plan next week with me",
  },
  es: {
    kinds: {
      lesson: "Lecciones",
      practice: "Práctica",
      review: "Repaso",
      exam_prep: "Preparación de examen",
      custom: "Otros",
    } as Record<Goal["kind"], string>,
    weekOf: (d: string) => `Semana del ${d}`,
    noGoals: "Sin objetivos esta semana",
    goalsDone: (done: string, total: string) =>
      `${done} de ${total} objetivos completados`,
    requiredLeft: (n: string) => ` · faltan ${n} obligatorios`,
    flashcardsDue: (n: string) => ` · ${n} tarjetas pendientes`,
    weekCompleteAll: "¡Semana completa: todos los objetivos hechos!",
    weekCompleteRequired: "¡Semana completa: todos los obligatorios hechos!",
    saveError:
      "No se pudo guardar el objetivo: se ha desmarcado. Inténtalo de nuevo.",
    nothingPlanned: "Todavía no hay nada planificado",
    upNext: "A continuación",
    openLesson: "Abrir",
    planWeek: "Planificar mi semana",
    required: "Obligatorio",
    planNextWeek: "Planifica conmigo la próxima semana",
  },
};

export default function StudyPlan() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const { callTool } = useCallTool("lms_complete_study_goal");
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  // Optimistic check-off: goal ids marked done locally while the tool runs.
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [saveError, setSaveError] = useState(false);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="flex justify-center bg-zinc-50 p-10 font-sans dark:bg-zinc-950">
            <div className="size-6 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { week_start, goals, context } = props;
  const isDone = (g: Goal) => g.done || checked.has(g.id);
  const doneCount = goals.filter(isDone).length;
  const progress = goals.length > 0 ? Math.round((doneCount / goals.length) * 100) : 0;
  const allDone = goals.length > 0 && doneCount === goals.length;
  // Week completion is gated on REQUIRED goals (#391); a plan without any
  // required goals keeps the original every-goal-done behavior.
  const requiredGoals = goals.filter((g) => g.required);
  const requiredLeft = requiredGoals.filter((g) => !isDone(g)).length;
  const weekComplete =
    goals.length > 0 && (requiredGoals.length > 0 ? requiredLeft === 0 : allDone);

  // week_start is a bare calendar date; pin it to UTC so it does not slip a day
  // for readers west of the meridian.
  const weekLabel = fmt.date(`${week_start}T00:00:00Z`);

  const check = (g: Goal) => {
    if (isDone(g)) return;
    setChecked((s) => new Set(s).add(g.id));
    callTool(
      { goal_id: g.id },
      {
        onSuccess: () => setSaveError(false),
        // Revert the optimistic check so the UI never lies about a failed save.
        onError: () => {
          setChecked((s) => {
            const next = new Set(s);
            next.delete(g.id);
            return next;
          });
          setSaveError(true);
        },
      }
    );
  };

  // Progress ring geometry (SVG circle, r=26).
  const R = 26;
  const CIRC = 2 * Math.PI * R;

  /**
   * "What do I do now" — the lessons the server already worked out and sent.
   *
   * `context.next_lessons` was only ever rendered inside the no-goals branch,
   * so the moment a student had a plan at all (the normal case, and both the
   * `default` and `done` fixtures) the payload was fetched and thrown away.
   * It is the one thing on this panel that answers "now what", so it renders
   * whenever it is non-empty, and each row opens its lesson.
   */
  const upNext =
    context.next_lessons.length === 0 ? null : (
      <div className="mb-4">
        <p className="m-0 mb-1.5 text-[11px] font-bold tracking-[1px] text-zinc-400 uppercase dark:text-zinc-500">
          🧭 {t.upNext}
        </p>
        <div className="flex flex-col gap-1.5">
          {context.next_lessons.slice(0, 3).map((l) => (
            <button
              key={l.lesson_id}
              onClick={() =>
                sendFollowUpMessage(
                  `Open lesson ${l.lesson_id} ("${l.lesson_title}") from "${l.course_title}" with lms_view_lesson.`
                )
              }
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-zinc-200 bg-white px-3.5 py-2.5 text-left dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-900 dark:text-zinc-100">
                  {l.lesson_title}
                </span>
                <span className="block truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                  {l.course_title}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-[var(--brand-600)] dark:text-[var(--brand-400)]">
                {t.openLesson} →
              </span>
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[640px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          <div className="mb-4 flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <svg width={64} height={64} viewBox="0 0 64 64" className="shrink-0">
              <circle
                cx={32}
                cy={32}
                r={R}
                fill="none"
                strokeWidth={6}
                className="stroke-zinc-100 dark:stroke-zinc-800"
              />
              <circle
                cx={32}
                cy={32}
                r={R}
                fill="none"
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - progress / 100)}
                transform="rotate(-90 32 32)"
                className={
                  weekComplete
                    ? "stroke-green-600 dark:stroke-green-400"
                    : "stroke-[var(--brand-600)] dark:stroke-[var(--brand-400)]"
                }
              />
              <text
                x={32}
                y={37}
                textAnchor="middle"
                className="fill-zinc-900 text-sm font-extrabold dark:fill-zinc-100"
              >
                {progress}%
              </text>
            </svg>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[17px] font-bold text-zinc-900 dark:text-zinc-100">
                {t.weekOf(weekLabel)}
              </h2>
              <p className="mt-1 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                {goals.length === 0
                  ? t.noGoals
                  : t.goalsDone(fmt.number(doneCount), fmt.number(goals.length))}
                {requiredLeft > 0 ? t.requiredLeft(fmt.number(requiredLeft)) : ""}
                {context.due_reviews > 0
                  ? t.flashcardsDue(fmt.number(context.due_reviews))
                  : ""}
              </p>
            </div>
          </div>

          {weekComplete && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-green-600 bg-green-100 px-4.5 py-3.5 dark:border-green-400 dark:bg-green-900">
              <span className="text-[22px]">🎉</span>
              <span className="text-sm font-bold text-green-600 dark:text-green-400">
                {allDone ? t.weekCompleteAll : t.weekCompleteRequired}
              </span>
            </div>
          )}

          {saveError && (
            <div className="mb-3 rounded-[10px] bg-red-50 px-[13px] py-[9px] text-[13px] text-red-700 dark:bg-red-950 dark:text-red-400">
              {t.saveError}
            </div>
          )}

          {goals.length === 0 ? (
            <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-3xl">🗓️</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                {t.nothingPlanned}
              </p>
              <button
                onClick={() =>
                  sendFollowUpMessage(
                    "Help me plan this week: propose study goals from my next lessons, weak spots, and due flashcards, then save them with lms_set_study_plan."
                  )
                }
                className="mt-4 cursor-pointer rounded-lg border-none bg-[var(--brand-600)] px-4 py-2 text-[13px] font-semibold text-white dark:bg-[var(--brand-400)]"
              >
                {t.planWeek}
              </button>
            </div>
          ) : (
            <div className="mb-4 flex flex-col gap-3.5">
              {KIND_ORDER.filter((k) => goals.some((g) => g.kind === k)).map((kind) => (
                <div key={kind}>
                  <p className="m-0 mb-1.5 text-[11px] font-bold tracking-[1px] text-zinc-400 uppercase dark:text-zinc-500">
                    {KIND_ICON[kind]} {t.kinds[kind]}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {goals
                      .filter((g) => g.kind === kind)
                      .map((g) => {
                        const done = isDone(g);
                        return (
                          <button
                            key={g.id}
                            onClick={() => check(g)}
                            disabled={done}
                            className={`flex w-full items-center gap-2.5 rounded-[10px] border bg-white px-3.5 py-2.5 text-left dark:bg-zinc-900 ${
                              done
                                ? "cursor-default border-green-600 dark:border-green-400"
                                : "cursor-pointer border-zinc-200 dark:border-zinc-800"
                            }`}
                          >
                            <span
                              className={`flex size-4.5 shrink-0 items-center justify-center rounded-[5px] text-xs font-extrabold text-white ${
                                done
                                  ? "border-none bg-green-600 dark:bg-green-400"
                                  : "border-2 border-zinc-400 bg-transparent dark:border-zinc-500"
                              }`}
                            >
                              {done ? "✓" : ""}
                            </span>
                            <span
                              className={`min-w-0 flex-1 text-sm ${
                                done
                                  ? "text-zinc-400 line-through dark:text-zinc-500"
                                  : "text-zinc-900 dark:text-zinc-100"
                              }`}
                            >
                              {g.title}
                            </span>
                            {g.required && (
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.5px] uppercase ${
                                  done
                                    ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                                }`}
                              >
                                {t.required}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {upNext}

          {goals.length > 0 && (
            <button
              onClick={() =>
                sendFollowUpMessage(
                  "Let's plan next week: look at what I finished and missed this week, my next lessons, and due flashcards, then propose next week's goals and save them with lms_set_study_plan."
                )
              }
              className="cursor-pointer rounded-lg border border-[var(--brand-600)] bg-transparent px-4 py-2 text-[13px] font-semibold text-[var(--brand-600)] dark:border-[var(--brand-400)] dark:text-[var(--brand-400)]"
            >
              {t.planNextWeek}
            </button>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
