import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const courseSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  tags: z.union([z.array(z.string()), z.string(), z.null()]),
  require_sequential_completion: z.boolean(),
  enrollment_count: z.number(),
  created_at: z.string(),
});

const lessonSchema = z.object({
  id: z.number(),
  title: z.string(),
  sequence: z.number(),
  status: z.string(),
});

const examSchema = z.object({
  id: z.number(),
  title: z.string(),
  date: z.string().nullable(),
  duration: z.number(),
  status: z.string(),
});

const propsSchema = z.object({
  course: courseSchema,
  lessons: z.array(lessonSchema),
  exams: z.array(examSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display detailed view of an LMS course with lessons, exams, and live stats",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading course details…",
    invoked: "Course details loaded",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(status: string): string {
  switch (status.toLowerCase()) {
    case "published":
      return "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400";
    case "draft":
      return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
    case "archived":
      return "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400";
    default:
      return "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400";
  }
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

// Narrow structuredContent safely to the shape we expect from lms_get_course_stats
interface CourseStats {
  active_enrollments?: number;
  published_lessons?: number;
  lesson_completion_rate?: number;
  exam_count?: number;
  submission_count?: number;
  average_score?: number;
}

function parseCourseStats(raw: unknown): CourseStats | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as CourseStats;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CourseDetail() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const [statsVisible, setStatsVisible] = useState(false);

  const {
    callTool: loadStats,
    isPending: statsLoading,
    data: statsData,
  } = useCallTool<{ course_id: number }>("lms_get_course_stats");

  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading course…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { course, lessons, exams } = props;
  const stats = parseCourseStats(statsData?.structuredContent);

  const handleLoadStats = () => {
    setStatsVisible(true);
    loadStats({ course_id: course.id });
  };

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Course header */}
          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="m-0 text-xl leading-[1.3] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {course.title}
              </h2>
              <span
                className={`shrink-0 rounded-[10px] px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap ${statusPill(
                  course.status
                )}`}
              >
                {course.status}
              </span>
            </div>

            {course.description && (
              <p className="mt-0 mb-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {course.description}
              </p>
            )}

            <div className="mb-3.5 flex flex-wrap gap-4">
              <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                👥 {course.enrollment_count} enrolled
              </span>
              <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                📅 Created {formatDate(course.created_at)}
              </span>
              {course.require_sequential_completion && (
                <span className="text-[13px] text-zinc-400 dark:text-zinc-500">🔒 Sequential</span>
              )}
            </div>

            {/* Load stats button */}
            <button
              onClick={handleLoadStats}
              disabled={statsLoading}
              className={`cursor-pointer rounded-lg border border-violet-600 px-4 py-[7px] text-[13px] font-medium text-violet-600 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-70 dark:border-violet-400 dark:text-violet-400 ${
                statsVisible
                  ? "bg-violet-50 dark:bg-violet-950"
                  : "bg-transparent"
              }`}
            >
              {statsLoading ? "Loading stats…" : "Load stats"}
            </button>

            {/* Stats row */}
            {statsVisible && stats && (
              <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 rounded-[10px] border border-green-200 bg-green-50 p-3.5 dark:border-green-900 dark:bg-green-950">
                {[
                  { label: "Active enrollments", value: stats.active_enrollments },
                  { label: "Published lessons", value: stats.published_lessons },
                  {
                    label: "Completion rate",
                    value:
                      stats.lesson_completion_rate != null
                        ? `${Math.round(stats.lesson_completion_rate)}%`
                        : undefined,
                  },
                  { label: "Exams", value: stats.exam_count },
                  { label: "Submissions", value: stats.submission_count },
                  {
                    label: "Avg score",
                    value:
                      stats.average_score != null
                        ? `${Math.round(stats.average_score)}%`
                        : undefined,
                  },
                ]
                  .filter((s) => s.value !== undefined)
                  .map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        {value}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                        {label}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Lessons */}
          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-[18px] dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mt-0 mb-3.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              Lessons ({lessons.length})
            </h3>

            {lessons.length === 0 ? (
              <p className="m-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                No lessons yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {lessons
                  .slice()
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-2.5 rounded-lg bg-zinc-100 px-2.5 py-2 dark:bg-zinc-800"
                    >
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[11px] font-bold text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                        {lesson.sequence}
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                        {lesson.title}
                      </span>
                      <span
                        className={`shrink-0 rounded-lg px-[7px] py-0.5 text-[11px] font-semibold ${statusPill(
                          lesson.status
                        )}`}
                      >
                        {lesson.status}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Exams */}
          <div className="rounded-xl border border-zinc-200 bg-white p-[18px] dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mt-0 mb-3.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              Exams ({exams.length})
            </h3>

            {exams.length === 0 ? (
              <p className="m-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                No exams yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {exams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex flex-wrap items-center gap-2.5 rounded-lg bg-zinc-100 px-2.5 py-2 dark:bg-zinc-800"
                  >
                    <span className="min-w-[100px] flex-1 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                      {exam.title}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      ⏱ {exam.duration} min
                    </span>
                    {exam.date && (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        📅 {formatDate(exam.date)}
                      </span>
                    )}
                    <span
                      className={`rounded-lg px-[7px] py-0.5 text-[11px] font-semibold ${statusPill(
                        exam.status
                      )}`}
                    >
                      {exam.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
