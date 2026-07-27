import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { NEUTRAL_TEXT, barClass, textClass } from "../shared/severity";
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

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Crunching school stats…",
    subtitle: "School overview",
    courses: "Courses",
    students: "Students",
    publishedLessons: "Published lessons",
    avgCompletion: "Avg completion",
    avgExamScore: "Avg exam score",
    atRisk: "At-risk students",
    // States the rule the number is actually computed from
    // (analytics.ts: active enrollment + course has published lessons +
    // zero completions), replacing a hardcoded "active · 0 lessons done"
    // that described nothing.
    atRiskRule: "active enrollments · 0 lessons done",
    published: (n: number) => `${n} published`,
    draft: (n: number) => `${n} draft`,
    archived: (n: number) => `${n} archived`,
    activeEnrollments: (n: string) => `${n} active enrollments`,
    submissions: (n: string) => `${n} submissions`,
    coursesHeading: (n: string) => `Courses (${n})`,
    enrolled: "enrolled",
    lessons: (n: number, s: string) => `${s} lesson${n === 1 ? "" : "s"}`,
    examAvg: "exam avg",
    noCourses: "No courses yet.",
    status: {
      published: "published",
      draft: "draft",
      archived: "archived",
    } as Record<string, string>,
  },
  es: {
    loading: "Calculando estadísticas…",
    subtitle: "Resumen de la escuela",
    courses: "Cursos",
    students: "Estudiantes",
    publishedLessons: "Lecciones publicadas",
    avgCompletion: "Finalización media",
    avgExamScore: "Nota media de exámenes",
    atRisk: "Estudiantes en riesgo",
    atRiskRule: "inscripciones activas · 0 lecciones",
    // Spanish agrees in number, so these cannot be a bare suffix.
    published: (n: number) => `${n} ${n === 1 ? "publicado" : "publicados"}`,
    draft: (n: number) => `${n} en borrador`,
    archived: (n: number) => `${n} ${n === 1 ? "archivado" : "archivados"}`,
    activeEnrollments: (n: string) => `${n} inscripciones activas`,
    submissions: (n: string) => `${n} entregas`,
    coursesHeading: (n: string) => `Cursos (${n})`,
    enrolled: "inscritos",
    lessons: (n: number, s: string) => `${s} ${n === 1 ? "lección" : "lecciones"}`,
    examAvg: "nota media",
    noCourses: "Todavía no hay cursos.",
    status: {
      published: "publicado",
      draft: "borrador",
      archived: "archivado",
    } as Record<string, string>,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(status: string): string {
  switch (status.toLowerCase()) {
    case "published":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case "draft":
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";
    case "archived":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  }
}

/**
 * Completion has no meaning for a course with nothing published to complete —
 * that is "no data", not 0%. Passing `null` keeps those bars neutral instead of
 * painting an empty draft course as a failing one.
 */
function completionOf(c: Course): number | null {
  return c.published_lessons > 0 ? c.completion_rate : null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SchoolOverview() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
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

  const { school, courses } = props;

  /**
   * "3 published · 2 draft" under a total of 6 — the archived courses were
   * simply left out, so the parts visibly failed to sum to the number directly
   * above them. Build the caption from whichever buckets are non-empty; the
   * three are exhaustive, so it now always adds up.
   */
  const breakdown = [
    school.courses_published > 0 ? t.published(school.courses_published) : null,
    school.courses_draft > 0 ? t.draft(school.courses_draft) : null,
    school.courses_archived > 0 ? t.archived(school.courses_archived) : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-4">
            <h2 className="m-0 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {school.name}
            </h2>
            <div className="mt-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
              {t.subtitle}
            </div>
          </div>

          {/* KPI grid */}
          <div className="mb-[22px] grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {/*
              Accent rule: a number is coloured only when it is a verdict —
              something a school can be doing well or badly at. Counts of
              courses, students and lessons are facts, so they stay neutral.
              Previously completion was brand-violet and at-risk was red with
              the other four plain, which read as if those two had been singled
              out for an unstated reason.
            */}
            {kpi(t.courses, fmt.number(school.courses_total), breakdown || undefined)}
            {kpi(
              t.students,
              fmt.number(school.students),
              t.activeEnrollments(fmt.number(school.active_enrollments))
            )}
            {kpi(t.publishedLessons, fmt.number(school.published_lessons))}
            {kpi(
              t.avgCompletion,
              fmt.percent(school.completion_rate),
              undefined,
              textClass(school.completion_rate)
            )}
            {kpi(
              t.avgExamScore,
              fmt.percent(school.avg_exam_score),
              t.submissions(fmt.number(school.exam_submissions)),
              textClass(school.avg_exam_score)
            )}
            {kpi(
              t.atRisk,
              fmt.number(school.at_risk_students),
              t.atRiskRule,
              school.at_risk_students > 0
                ? "text-red-600 dark:text-red-400"
                : undefined
            )}
          </div>

          {/* Per-course breakdown */}
          <h3 className="mt-0 mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t.coursesHeading(fmt.number(courses.length))}
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
                      {t.status[c.status.toLowerCase()] ?? c.status}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-[3px] bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-[3px] ${barClass(completionOf(c))}`}
                      style={{ width: `${c.completion_rate}%` }}
                    />
                  </div>
                </div>

                <div className="min-w-16 shrink-0 text-right">
                  <div className={`text-sm font-bold ${NEUTRAL_TEXT}`}>
                    {fmt.number(c.active_enrollments)}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {t.enrolled}
                  </div>
                </div>

                <div className="min-w-14 shrink-0 text-right">
                  <div className={`text-sm font-bold ${textClass(completionOf(c))}`}>
                    {completionOf(c) === null ? "—" : fmt.percent(c.completion_rate)}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {t.lessons(c.published_lessons, fmt.number(c.published_lessons))}
                  </div>
                </div>

                <div className="min-w-14 shrink-0 text-right">
                  <div className={`text-sm font-bold ${textClass(c.exam_avg)}`}>
                    {fmt.percent(c.exam_avg)}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {t.examAvg}
                  </div>
                </div>
              </div>
            ))}

            {courses.length === 0 && (
              <p className="m-0 p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.noCourses}
              </p>
            )}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
