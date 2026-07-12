import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
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

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="flex justify-center bg-zinc-50 p-10 font-sans dark:bg-zinc-950">
            <div className="size-6 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { course_title, exam, readiness, components, formula, topics, lessons } =
    props;

  const examDate = exam?.exam_date
    ? new Date(exam.exam_date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const componentChips: Array<{ label: string; value: number | null; weight: number }> = [
    { label: "Exam history", value: components.exam_history, weight: components.weights.exam_history },
    { label: "Practice", value: components.practice, weight: components.weights.practice },
    {
      label: `Lessons ${lessons.completed}/${lessons.total}`,
      value: components.lesson_coverage,
      weight: components.weights.lesson_coverage,
    },
  ];

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="mx-auto max-w-[720px] bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          <div className="mb-4">
            <h2 className="m-0 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Exam readiness — {course_title}
            </h2>
            {exam && (
              <p className="mt-1 mb-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                {exam.title}
                {examDate ? ` · ${examDate}` : ""}
              </p>
            )}
          </div>

          {readiness === null ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 text-3xl">🧭</div>
              <p className="m-0 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                No signal yet
              </p>
              <p className="mt-1.5 mb-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                Take a practice quiz to calibrate your readiness.
              </p>
              <button
                onClick={() =>
                  sendFollowUpMessage(
                    `Generate a diagnostic practice quiz for "${course_title}" with lms_practice_quiz so we can calibrate my exam readiness.`
                  )
                }
                className="mt-4 cursor-pointer rounded-lg border-none bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white dark:bg-violet-400"
              >
                Start a diagnostic quiz
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
                        {c.label}: {c.value === null ? "n/a" : c.value}
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
                    No per-topic history yet — practice quizzes and exam attempts will
                    show up here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {topics.map((t, i) => (
                    <div
                      key={`${t.label}-${i}`}
                      className="rounded-[10px] border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                          {t.source === "exam" ? "📄 " : "✏️ "}
                          {t.label}
                        </span>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className={`text-[13px] font-bold ${bandText(t.mastery)}`}>
                            {t.mastery}
                          </span>
                          <button
                            onClick={() =>
                              sendFollowUpMessage(
                                `Generate a practice quiz on "${t.label}" with lms_practice_quiz — focus on my misses. (Course: ${course_title})`
                              )
                            }
                            className="cursor-pointer rounded-md border border-violet-600 bg-transparent px-2.5 py-1 text-xs font-semibold text-violet-600 dark:border-violet-400 dark:text-violet-400"
                          >
                            Practice this
                          </button>
                        </div>
                      </div>
                      <div className="mb-1.5 h-1.5 overflow-hidden rounded-[3px] bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className={`h-full rounded-[3px] ${bandFill(t.mastery)}`}
                          style={{ width: `${Math.max(0, Math.min(100, t.mastery))}%` }}
                        />
                      </div>
                      <p className="m-0 text-xs text-zinc-400 dark:text-zinc-500">
                        {t.evidence}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
