import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { z } from "zod";

// Props produced by lms_get_exam_readiness (Epic #348 Phase 3, #358).
const propsSchema = z.object({
  course_id: z.number().describe("The course being assessed"),
  course_title: z.string().describe("Course title"),
  exam: z
    .object({
      exam_id: z.number(),
      title: z.string(),
      exam_date: z.string().nullable(),
    })
    .nullable()
    .describe("The targeted or next upcoming exam, if any"),
  readiness: z
    .number()
    .nullable()
    .describe("Overall readiness 0-100, null when there is no signal yet"),
  components: z.object({
    exam_history: z.number().nullable(),
    practice: z.number().nullable(),
    lesson_coverage: z.number().nullable(),
    weights: z.object({
      exam_history: z.number(),
      practice: z.number(),
      lesson_coverage: z.number(),
    }),
  }),
  formula: z.string().describe("Human-readable readiness formula"),
  topics: z.array(
    z.object({
      label: z.string(),
      mastery: z.number(),
      source: z.enum(["exam", "practice"]),
      evidence: z.string(),
    })
  ),
  lessons: z.object({ completed: z.number(), total: z.number() }),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Exam readiness report: overall readiness score, component breakdown, and a per-topic mastery heatmap with practice launch buttons.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Checking your exam readiness...",
    invoked: "Readiness report ready",
  },
};

type Props = z.infer<typeof propsSchema>;

const STRINGS = {
  en: {
    title: (course: string) => `Exam readiness — ${course}`,
    noSignal: "No signal yet",
    noSignalHint: "Take a practice quiz to calibrate your readiness.",
    startDiagnostic: "Start a diagnostic quiz",
    examHistory: "Exam history",
    practice: "Practice",
    lessons: (done: string, total: string) => `Lessons ${done}/${total}`,
    na: "n/a",
    noTopics:
      "No per-topic history yet — practice quizzes and exam attempts will show up here.",
    practiceThis: "Practice this",
    focusHere: "Focus here first",
    today: "today",
  },
  es: {
    title: (course: string) => `Preparación para el examen — ${course}`,
    noSignal: "Sin datos todavía",
    noSignalHint:
      "Haz un cuestionario de práctica para calibrar tu preparación.",
    startDiagnostic: "Empezar un cuestionario de diagnóstico",
    examHistory: "Historial de exámenes",
    practice: "Práctica",
    lessons: (done: string, total: string) => `Lecciones ${done}/${total}`,
    na: "n/d",
    noTopics:
      "Todavía no hay historial por tema: los cuestionarios de práctica y los intentos de examen aparecerán aquí.",
    practiceThis: "Practicar esto",
    focusHere: "Empieza por aquí",
    today: "hoy",
  },
};

/**
 * At or above this, a topic is "solid": it still gets a practice link, but a
 * quiet one. The whole point of the report is what to fix first, and six
 * equally loud buttons answer that question with "everything".
 */
const SOLID_AT = 80;

// Fixed score buckets → Tailwind class strings (pass ≥80, warn ≥60, fail <60)
const bandText = (v: number) =>
  v >= 80
    ? "text-green-600 dark:text-green-400"
    : v >= 60
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

const bandFill = (v: number) =>
  v >= 80
    ? "bg-green-600 dark:bg-green-400"
    : v >= 60
      ? "bg-amber-600 dark:bg-amber-400"
      : "bg-red-600 dark:bg-red-400";

const bandDial = (v: number) =>
  v >= 80
    ? "border-green-600 bg-green-100 dark:border-green-400 dark:bg-green-900"
    : v >= 60
      ? "border-amber-600 bg-amber-100 dark:border-amber-400 dark:bg-amber-950"
      : "border-red-600 bg-red-100 dark:border-red-400 dark:bg-red-950";

export default function ExamReadiness() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

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

  const { course_title, exam, readiness, components, formula, topics, lessons } =
    props;

  const examDate = exam?.exam_date ? fmt.date(exam.exam_date) : null;

  /**
   * How long the student actually has. `exam_date` was in the payload but only
   * ever printed as a calendar date, which makes the reader do the subtraction
   * — and the answer to "how much time do I have" is the reason to look at this
   * panel at all. Counted in whole days so a 09:00 exam tomorrow reads
   * "tomorrow" rather than "in 0 days".
   */
  const daysLeft = exam?.exam_date ? fmt.daysUntil(exam.exam_date) : null;
  const countdown =
    daysLeft === null ? null : daysLeft === 0 ? t.today : fmt.relativeDays(daysLeft);
  // A week out is when it stops being trivia and starts being pressure.
  const urgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

  const componentChips: Array<{ label: string; value: number | null; weight: number }> = [
    { label: t.examHistory, value: components.exam_history, weight: components.weights.exam_history },
    { label: t.practice, value: components.practice, weight: components.weights.practice },
    {
      label: t.lessons(fmt.number(lessons.completed), fmt.number(lessons.total)),
      value: components.lesson_coverage,
      weight: components.weights.lesson_coverage,
    },
  ];

  /**
   * Weakest first. The payload arrives in whatever order the server assembled
   * it, which put the 12% topic last and buried the single most useful line in
   * the report. Sorted on a copy — `topics` is props and must not be mutated.
   */
  const rankedTopics = [...topics].sort((a, b) => a.mastery - b.mastery);

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[720px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          <div className="mb-4">
            <h2 className="m-0 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {t.title(course_title)}
            </h2>
            {exam && (
              <p className="mt-1 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                {exam.title}
                {examDate ? ` · ${examDate}` : ""}
                {countdown ? " · " : ""}
                {countdown && (
                  <span
                    className={
                      urgent
                        ? "font-semibold text-amber-600 dark:text-amber-400"
                        : undefined
                    }
                  >
                    {countdown}
                  </span>
                )}
              </p>
            )}
          </div>

          {readiness === null ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-3xl">🧭</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                {t.noSignal}
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.noSignalHint}
              </p>
              <button
                onClick={() =>
                  sendFollowUpMessage(
                    `Generate a diagnostic practice quiz for "${course_title}" with lms_practice_quiz so we can calibrate my exam readiness.`
                  )
                }
                className="mt-4 cursor-pointer rounded-lg border-none bg-[var(--brand-600)] px-4 py-2 text-[13px] font-semibold text-white dark:bg-[var(--brand-400)]"
              >
                {t.startDiagnostic}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div
                  className={`flex size-[88px] shrink-0 items-center justify-center rounded-full border-[6px] ${bandDial(readiness)}`}
                >
                  <span className={`text-[26px] font-extrabold ${bandText(readiness)}`}>
                    {readiness}
                  </span>
                </div>
                <div className="min-w-[220px] flex-1">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {componentChips.map((c) => (
                      <span
                        key={c.label}
                        className={`rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-950 ${
                          c.value === null
                            ? "text-zinc-400 dark:text-zinc-500"
                            : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {c.label}: {c.value === null ? t.na : c.value}
                        {c.value !== null && c.weight > 0
                          ? ` (${Math.round(c.weight * 100)}%)`
                          : ""}
                      </span>
                    ))}
                  </div>
                  <p className="m-0 text-xs text-zinc-400 dark:text-zinc-500">{formula}</p>
                </div>
              </div>

              {topics.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="m-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                    {t.noTopics}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {rankedTopics.map((topic, i) => {
                    const solid = topic.mastery >= SOLID_AT;
                    // The first row is the weakest topic in the course, which
                    // is the one thing this whole report exists to say.
                    const weakest = i === 0 && !solid;
                    return (
                      <div
                        key={`${topic.label}-${topic.source}`}
                        className={`rounded-[10px] border bg-white px-4 py-3 dark:bg-zinc-900 ${
                          weakest
                            ? "border-red-300 dark:border-red-900"
                            : "border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                              {topic.source === "exam" ? "📄 " : "✏️ "}
                              {topic.label}
                            </span>
                            {weakest && (
                              <span className="shrink-0 rounded-md bg-red-50 px-[7px] py-px text-[10.5px] font-bold text-red-600 dark:bg-red-950 dark:text-red-400">
                                {t.focusHere}
                              </span>
                            )}
                          </span>
                          <div className="flex shrink-0 items-center gap-2.5">
                            <span
                              className={`text-[13px] font-bold ${bandText(topic.mastery)}`}
                            >
                              {topic.mastery}
                            </span>
                            {/*
                              Same action either way; only the volume changes.
                              A mastered topic keeps its practice link so it is
                              still reachable, but it stops competing with the
                              topics that actually need the time.
                            */}
                            <button
                              onClick={() =>
                                sendFollowUpMessage(
                                  `Generate a practice quiz on "${topic.label}" with lms_practice_quiz — focus on my misses. (Course: ${course_title})`
                                )
                              }
                              className={
                                solid
                                  ? "cursor-pointer border-none bg-transparent px-1 py-1 text-xs font-medium text-zinc-400 underline underline-offset-2 dark:text-zinc-500"
                                  : "cursor-pointer rounded-md border border-[var(--brand-600)] bg-transparent px-2.5 py-1 text-xs font-semibold text-[var(--brand-600)] dark:border-[var(--brand-400)] dark:text-[var(--brand-400)]"
                              }
                            >
                              {t.practiceThis}
                            </button>
                          </div>
                        </div>
                        <div className="mb-1.5 h-1.5 overflow-hidden rounded-[3px] bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className={`h-full rounded-[3px] ${bandFill(topic.mastery)}`}
                            style={{
                              width: `${Math.max(0, Math.min(100, topic.mastery))}%`,
                            }}
                          />
                        </div>
                        <p className="m-0 text-xs text-zinc-400 dark:text-zinc-500">
                          {topic.evidence}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
