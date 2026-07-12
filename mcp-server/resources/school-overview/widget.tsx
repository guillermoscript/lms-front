import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const courseSchema = z.object({
  id: z.number(),
  title: z.string(),
  status: z.string(),
  active_enrollments: z.number(),
  published_lessons: z.number(),
  completion_rate: z.number(),
  exam_avg: z.number().nullable(),
  submission_count: z.number(),
});

const propsSchema = z.object({
  school: z.object({
    name: z.string(),
    courses_total: z.number(),
    courses_published: z.number(),
    courses_draft: z.number(),
    courses_archived: z.number(),
    active_enrollments: z.number(),
    students: z.number(),
    published_lessons: z.number(),
    completion_rate: z.number(),
    exam_submissions: z.number(),
    avg_exam_score: z.number().nullable(),
    at_risk_students: z.number(),
  }),
  courses: z.array(courseSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "School-wide overview dashboard: course/student/enrollment KPIs, completion and exam averages, at-risk count, and a per-course breakdown. Admin only.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Crunching school stats…",
    invoked: "School overview ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type Course = z.infer<typeof courseSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(status: string): string {
  switch (status.toLowerCase()) {
    case "published":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case "draft":
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
    case "archived":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  }
}

function completionColor(pct: number): string {
  if (pct >= 80) return "bg-green-600 dark:bg-green-400";
  if (pct >= 40) return "bg-violet-600 dark:bg-violet-400";
  if (pct > 0) return "bg-amber-600 dark:bg-amber-400";
  return "bg-zinc-300 dark:bg-zinc-600";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SchoolOverview() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Crunching school stats…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { school, courses } = props;

  const kpi = (
    label: string,
    value: string,
    sub?: string,
    accentClass?: string
  ) => (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div
        className={`text-2xl leading-[1.1] font-bold ${
          accentClass ?? "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          {sub}
        </div>
      )}
    </div>
  );

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-4">
            <h2 className="m-0 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {school.name}
            </h2>
            <div className="mt-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
              School overview
            </div>
          </div>

          {/* KPI grid */}
          <div className="mb-[22px] grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {kpi(
              "Courses",
              String(school.courses_total),
              `${school.courses_published} published · ${school.courses_draft} draft`
            )}
            {kpi(
              "Students",
              String(school.students),
              `${school.active_enrollments} active enrollments`
            )}
            {kpi("Published lessons", String(school.published_lessons))}
            {kpi(
              "Avg completion",
              `${school.completion_rate}%`,
              undefined,
              "text-violet-600 dark:text-violet-400"
            )}
            {kpi(
              "Avg exam score",
              school.avg_exam_score == null ? "—" : `${school.avg_exam_score}%`,
              `${school.exam_submissions} submissions`
            )}
            {kpi(
              "At-risk students",
              String(school.at_risk_students),
              "active · 0 lessons done",
              school.at_risk_students > 0
                ? "text-red-600 dark:text-red-400"
                : undefined
            )}
          </div>

          {/* Per-course breakdown */}
          <h3 className="mt-0 mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Courses ({courses.length})
          </h3>

          <div className="flex flex-col gap-2">
            {courses.map((c: Course) => (
              <div
                key={c.id}
                className="flex items-center gap-3.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* Title + status + completion bar */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {c.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-[7px] px-[7px] py-px text-[10.5px] font-semibold ${statusPill(c.status)}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-[3px] bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-[3px] ${completionColor(c.completion_rate)}`}
                      style={{ width: `${c.completion_rate}%` }}
                    />
                  </div>
                </div>

                <div className="min-w-16 shrink-0 text-right">
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {c.active_enrollments}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    enrolled
                  </div>
                </div>

                <div className="min-w-14 shrink-0 text-right">
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {c.completion_rate}%
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {c.published_lessons} lesson
                    {c.published_lessons === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="min-w-14 shrink-0 text-right">
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {c.exam_avg == null ? "—" : `${c.exam_avg}%`}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    exam avg
                  </div>
                </div>
              </div>
            ))}

            {courses.length === 0 && (
              <p className="m-0 p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                No courses yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
