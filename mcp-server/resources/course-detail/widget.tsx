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

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading course…",
    status: {
      published: "Published",
      draft: "Draft",
      archived: "Archived",
    } as Record<string, string>,
    enrolled: (n: string) => `${n} enrolled`,
    created: (d: string) => `Created ${d}`,
    sequential: "Sequential",
    loadStats: "Load stats",
    loadingStats: "Loading stats…",
    statActiveEnrollments: "Active enrollments",
    statPublishedLessons: "Published lessons",
    statCompletionRate: "Completion rate",
    statExams: "Exams",
    statSubmissions: "Submissions",
    statAvgScore: "Avg score",
    lessonsHeading: (n: string) => `Lessons (${n})`,
    noLessons: "No lessons yet.",
    examsHeading: (n: string) => `Exams (${n})`,
    noExams: "No exams yet.",
    minutes: (n: string) => `${n} min`,
  },
  es: {
    loading: "Cargando curso…",
    status: {
      published: "Publicado",
      draft: "Borrador",
      archived: "Archivado",
    } as Record<string, string>,
    enrolled: (n: string) => `${n} inscritos`,
    created: (d: string) => `Creado el ${d}`,
    sequential: "Secuencial",
    loadStats: "Cargar estadísticas",
    loadingStats: "Cargando estadísticas…",
    statActiveEnrollments: "Inscripciones activas",
    statPublishedLessons: "Lecciones publicadas",
    statCompletionRate: "Tasa de finalización",
    statExams: "Exámenes",
    statSubmissions: "Entregas",
    statAvgScore: "Nota media",
    lessonsHeading: (n: string) => `Lecciones (${n})`,
    noLessons: "Todavía no hay lecciones.",
    examsHeading: (n: string) => `Exámenes (${n})`,
    noExams: "Todavía no hay exámenes.",
    minutes: (n: string) => `${n} min`,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(status: string): string {
  switch (status.toLowerCase()) {
    case "published":
      return "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400";
    case "draft":
      return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
    case "archived":
      return "bg-[var(--brand-50)] text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]";
    default:
      return "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400";
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
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { course, lessons, exams } = props;
  const stats = parseCourseStats(statsData?.structuredContent);
  const statusLabel = (status: string) => t.status[status.toLowerCase()] ?? status;

  const handleLoadStats = () => {
    setStatsVisible(true);
    loadStats({ course_id: course.id });
  };

  return (
    <McpUseProvider autoSize>
      <Brand />
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
                {statusLabel(course.status)}
              </span>
            </div>

            {course.description && (
              <p className="mt-0 mb-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {course.description}
              </p>
            )}

            <div className="mb-3.5 flex flex-wrap gap-4">
              <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                👥 {t.enrolled(fmt.number(course.enrollment_count))}
              </span>
              <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                📅 {t.created(fmt.date(course.created_at))}
              </span>
              {course.require_sequential_completion && (
                <span className="text-[13px] text-zinc-400 dark:text-zinc-500">🔒 {t.sequential}</span>
              )}
            </div>

            {/* Load stats button */}
            <button
              onClick={handleLoadStats}
              disabled={statsLoading}
              className={`cursor-pointer rounded-lg border border-[var(--brand-600)] px-4 py-[7px] text-[13px] font-medium text-[var(--brand-600)] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-70 dark:border-[var(--brand-400)] dark:text-[var(--brand-400)] ${
                statsVisible
                  ? "bg-[var(--brand-50)] dark:bg-[var(--brand-950)]"
                  : "bg-transparent"
              }`}
            >
              {statsLoading ? t.loadingStats : t.loadStats}
            </button>

            {/* Stats row */}
            {statsVisible && stats && (
              <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 rounded-[10px] border border-green-200 bg-green-50 p-3.5 dark:border-green-900 dark:bg-green-950">
                {[
                  {
                    label: t.statActiveEnrollments,
                    value:
                      stats.active_enrollments != null
                        ? fmt.number(stats.active_enrollments)
                        : undefined,
                  },
                  {
                    label: t.statPublishedLessons,
                    value:
                      stats.published_lessons != null
                        ? fmt.number(stats.published_lessons)
                        : undefined,
                  },
                  {
                    label: t.statCompletionRate,
                    value:
                      stats.lesson_completion_rate != null
                        ? fmt.percent(Math.round(stats.lesson_completion_rate))
                        : undefined,
                  },
                  {
                    label: t.statExams,
                    value: stats.exam_count != null ? fmt.number(stats.exam_count) : undefined,
                  },
                  {
                    label: t.statSubmissions,
                    value:
                      stats.submission_count != null
                        ? fmt.number(stats.submission_count)
                        : undefined,
                  },
                  {
                    label: t.statAvgScore,
                    value:
                      stats.average_score != null
                        ? fmt.percent(Math.round(stats.average_score))
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
              {t.lessonsHeading(fmt.number(lessons.length))}
            </h3>

            {lessons.length === 0 ? (
              <p className="m-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.noLessons}
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
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-[11px] font-bold text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]">
                        {fmt.number(lesson.sequence)}
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                        {lesson.title}
                      </span>
                      <span
                        className={`shrink-0 rounded-lg px-[7px] py-0.5 text-[11px] font-semibold ${statusPill(
                          lesson.status
                        )}`}
                      >
                        {statusLabel(lesson.status)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Exams */}
          <div className="rounded-xl border border-zinc-200 bg-white p-[18px] dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mt-0 mb-3.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              {t.examsHeading(fmt.number(exams.length))}
            </h3>

            {exams.length === 0 ? (
              <p className="m-0 text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.noExams}
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
                      ⏱ {t.minutes(fmt.number(exam.duration))}
                    </span>
                    {exam.date && (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        📅 {fmt.date(exam.date)}
                      </span>
                    )}
                    <span
                      className={`rounded-lg px-[7px] py-0.5 text-[11px] font-semibold ${statusPill(
                        exam.status
                      )}`}
                    >
                      {statusLabel(exam.status)}
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
