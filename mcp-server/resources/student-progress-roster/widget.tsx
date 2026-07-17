import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const studentSchema = z.object({
  student_id: z.string(),
  student_name: z.string().nullable(),
  status: z.string(),
  enrolled: z.string(),
  completed_lessons: z.number(),
  progress_pct: z.number().nullable(),
  exam_avg: z.number().nullable(),
  exam_count: z.number(),
  last_active: z.string().nullable(),
  at_risk: z.boolean(),
});

const propsSchema = z.object({
  course: z.object({
    id: z.number(),
    title: z.string(),
    published_lessons: z.number(),
  }),
  students: z.array(studentSchema),
  summary: z.object({
    total: z.number(),
    at_risk: z.number(),
    avg_progress: z.number(),
  }),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Per-student progress roster for a course: lesson-completion %, exam average, last activity, and at-risk flags.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading roster…",
    invoked: "Roster loaded",
  },
};

type Props = z.infer<typeof propsSchema>;
type Student = z.infer<typeof studentSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function progressColor(pct: number | null): string {
  if (pct == null) return "bg-zinc-300 dark:bg-zinc-600";
  if (pct >= 80) return "bg-green-600 dark:bg-green-400";
  if (pct >= 40) return "bg-violet-600 dark:bg-violet-400";
  if (pct > 0) return "bg-amber-600 dark:bg-amber-400";
  return "bg-red-600 dark:bg-red-400";
}

function initials(name: string | null, id: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return id.slice(0, 2).toUpperCase();
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StudentProgressRoster() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const [atRiskOnly, setAtRiskOnly] = useState(false);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading roster…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { course, students, summary } = props;
  const visible = atRiskOnly ? students.filter((s) => s.at_risk) : students;

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
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-1">
            <h2 className="m-0 text-[19px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {course.title}
            </h2>
            <div className="mt-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
              Student roster · {course.published_lessons} published lesson
              {course.published_lessons === 1 ? "" : "s"}
            </div>
          </div>

          {/* Summary */}
          <div className="my-3.5 flex w-fit gap-6 rounded-xl border border-zinc-200 bg-white px-[18px] py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
            {stat("Students", String(summary.total))}
            {stat(
              "Avg progress",
              `${summary.avg_progress}%`,
              "text-violet-600 dark:text-violet-400"
            )}
            {stat(
              "At risk",
              String(summary.at_risk),
              summary.at_risk > 0 ? "text-red-600 dark:text-red-400" : undefined
            )}
          </div>

          {/* Filter */}
          {summary.at_risk > 0 && (
            <button
              onClick={() => setAtRiskOnly((v) => !v)}
              className={`mb-3 cursor-pointer rounded-lg border px-3.5 py-1.5 text-[12.5px] font-medium ${
                atRiskOnly
                  ? "border-red-600 bg-red-50 text-red-600 dark:border-red-400 dark:bg-red-950 dark:text-red-400"
                  : "border-zinc-200 bg-transparent text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
              }`}
            >
              {atRiskOnly ? "✓ At risk only" : "Show at risk only"}
            </button>
          )}

          {/* Rows */}
          <div className="flex flex-col gap-2">
            {visible.map((s: Student) => {
              const pct = s.progress_pct;
              const name = s.student_name ?? s.student_id.slice(0, 8);
              return (
                <div
                  key={s.student_id}
                  className={`flex flex-wrap items-center gap-3.5 rounded-xl border bg-white px-3.5 py-3 dark:bg-zinc-900 ${
                    s.at_risk
                      ? "border-red-200 dark:border-red-900"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {/* Avatar */}
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[13px] font-bold text-violet-600 uppercase dark:bg-violet-950 dark:text-violet-400">
                    {initials(s.student_name, s.student_id)}
                  </div>

                  {/* Name + progress bar */}
                  <div className="min-w-40 flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {name}
                      </span>
                      {s.at_risk && (
                        <span className="shrink-0 rounded-md bg-red-50 px-[7px] py-px text-[10.5px] font-bold text-red-600 dark:bg-red-950 dark:text-red-400">
                          AT RISK
                        </span>
                      )}
                      {s.status !== "active" && (
                        <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                          {s.status}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-[3px] bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-[3px] transition-[width] duration-300 ${progressColor(pct)}`}
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="min-w-14 shrink-0 text-right">
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {pct == null ? "—" : `${pct}%`}
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {s.completed_lessons}/{course.published_lessons} lessons
                    </div>
                  </div>

                  <div className="min-w-16 shrink-0 text-right">
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {s.exam_avg == null ? "—" : `${s.exam_avg}%`}
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {s.exam_count} exam{s.exam_count === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="min-w-20 shrink-0 text-right">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {relativeDate(s.last_active)}
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      last active
                    </div>
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && (
              <p className="m-0 p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                {atRiskOnly ? "No at-risk students. 🎉" : "No students enrolled."}
              </p>
            )}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
