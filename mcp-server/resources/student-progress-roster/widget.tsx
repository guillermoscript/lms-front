import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { NEUTRAL_TEXT, barClass, textClass } from "../shared/severity";
import { isNamedStudent, studentDisplayName, studentInitials } from "../shared/student-display";
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

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading roster…",
    roster: (n: number, s: string) =>
      `Student roster · ${s} published lesson${n === 1 ? "" : "s"}`,
    students: "Students",
    avgProgress: "Avg progress",
    atRisk: "At risk",
    atRiskOnlyOn: "✓ At risk only",
    atRiskOnlyOff: "Show at risk only",
    atRiskBadge: "AT RISK",
    lessons: (done: string, total: string) => `${done}/${total} lessons`,
    exams: (n: number, s: string) => `${s} exam${n === 1 ? "" : "s"}`,
    lastActive: "last active",
    noAtRisk: "No at-risk students. 🎉",
    noStudents: "No students enrolled.",
    // Shown when `profiles.full_name` is empty. Never the user id: that names
    // nobody and reads as corrupted data.
    unnamedStudent: "Unnamed student",
    // An exam that was submitted but not yet scored — distinct from "no exam".
    ungraded: "Ungraded",
  },
  es: {
    loading: "Cargando lista…",
    roster: (n: number, s: string) =>
      `Lista de estudiantes · ${s} ${n === 1 ? "lección publicada" : "lecciones publicadas"}`,
    students: "Estudiantes",
    avgProgress: "Progreso medio",
    atRisk: "En riesgo",
    atRiskOnlyOn: "✓ Solo en riesgo",
    atRiskOnlyOff: "Ver solo en riesgo",
    atRiskBadge: "EN RIESGO",
    lessons: (done: string, total: string) => `${done}/${total} lecciones`,
    exams: (n: number, s: string) => `${s} ${n === 1 ? "examen" : "exámenes"}`,
    lastActive: "última actividad",
    noAtRisk: "Ningún estudiante en riesgo. 🎉",
    noStudents: "No hay estudiantes inscritos.",
    unnamedStudent: "Estudiante sin nombre",
    ungraded: "Sin calificar",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The exam column reads as three distinct states. `—` (what `fmt.percent`
 * renders for null) is this widget's glyph for "no data" everywhere else, so it
 * may only mean "has not sat an exam" — a submission waiting on a grade has to
 * say so, or it reads as a student who took an exam and scored nothing.
 */
function examCell(
  avg: number | null,
  count: number,
  ungradedLabel: string,
  fmtPercent: (n: number | null) => string
): { value: string; valueClass: string } {
  if (count > 0 && avg == null) {
    return {
      value: ungradedLabel,
      valueClass: "text-[12.5px] font-semibold text-amber-600 dark:text-amber-400",
    };
  }
  return { value: fmtPercent(avg), valueClass: `text-sm font-bold ${textClass(avg)}` };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StudentProgressRoster() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();
  const [atRiskOnly, setAtRiskOnly] = useState(false);

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
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-1">
            <h2 className="m-0 text-[19px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {course.title}
            </h2>
            <div className="mt-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
              {t.roster(
                course.published_lessons,
                fmt.number(course.published_lessons)
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="my-3.5 flex w-fit gap-6 rounded-xl border border-zinc-200 bg-white px-[18px] py-3.5 dark:border-zinc-800 dark:bg-zinc-900">
            {/* Same accent rule as school-overview: counts are facts and stay
                neutral; only the numbers that read as good or bad get colour. */}
            {stat(t.students, fmt.number(summary.total))}
            {stat(
              t.avgProgress,
              fmt.percent(summary.avg_progress),
              textClass(summary.avg_progress)
            )}
            {stat(
              t.atRisk,
              fmt.number(summary.at_risk),
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
              {atRiskOnly ? t.atRiskOnlyOn : t.atRiskOnlyOff}
            </button>
          )}

          {/* Rows */}
          <div className="flex flex-col gap-2">
            {visible.map((s: Student) => {
              const pct = s.progress_pct;
              const named = isNamedStudent(s.student_name);
              const name = studentDisplayName(s.student_name, t.unnamedStudent);
              const exam = examCell(s.exam_avg, s.exam_count, t.ungraded, fmt.percent);
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
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-[13px] font-bold text-[var(--brand-600)] uppercase dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]">
                    {studentInitials(s.student_name)}
                  </div>

                  {/* Name + progress bar */}
                  <div className="min-w-40 flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span
                        className={`truncate text-sm ${
                          named
                            ? "font-semibold text-zinc-900 dark:text-zinc-100"
                            : "font-medium text-zinc-400 italic dark:text-zinc-500"
                        }`}
                      >
                        {name}
                      </span>
                      {s.at_risk && (
                        <span className="shrink-0 rounded-md bg-red-50 px-[7px] py-px text-[10.5px] font-bold text-red-600 dark:bg-red-950 dark:text-red-400">
                          {t.atRiskBadge}
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
                        className={`h-full rounded-[3px] transition-[width] duration-300 ${barClass(pct)}`}
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="min-w-14 shrink-0 text-right">
                    <div className={`text-sm font-bold ${textClass(pct)}`}>
                      {fmt.percent(pct)}
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {t.lessons(
                        fmt.number(s.completed_lessons),
                        fmt.number(course.published_lessons)
                      )}
                    </div>
                  </div>

                  <div className="min-w-20 shrink-0 text-right">
                    <div className={exam.valueClass}>{exam.value}</div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {t.exams(s.exam_count, fmt.number(s.exam_count))}
                    </div>
                  </div>

                  <div className="min-w-20 shrink-0 text-right">
                    <div className={`text-xs ${NEUTRAL_TEXT}`}>
                      {fmt.date(s.last_active)}
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {t.lastActive}
                    </div>
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && (
              <p className="m-0 p-6 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                {atRiskOnly ? t.noAtRisk : t.noStudents}
              </p>
            )}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
