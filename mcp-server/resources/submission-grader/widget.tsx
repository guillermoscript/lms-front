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
import { studentDisplayName } from "../shared/student-display";
import { z } from "zod";
import { Markdown } from "../shared/markdown";

// ── Schema ──────────────────────────────────────────────────────────────────

const optionSchema = z.object({
  text: z.string(),
  is_correct: z.boolean(),
});

const questionSchema = z.object({
  question_id: z.number(),
  text: z.string(),
  type: z.string(),
  options: z.array(optionSchema),
  student_answer: z.string().nullable(),
  points_earned: z.number().nullable(),
  points_possible: z.number().nullable(),
  is_correct: z.boolean().nullable(),
  ai_feedback: z.string().nullable(),
  ai_confidence: z.number().nullable(),
  is_overridden: z.boolean(),
});

const propsSchema = z.object({
  submission: z.object({
    id: z.number(),
    exam_id: z.number(),
    exam_title: z.string(),
    student_id: z.string(),
    student_name: z.string().nullable(),
    score: z.number().nullable(),
    feedback: z.string(),
    review_status: z.string(),
    date: z.string(),
  }),
  questions: z.array(questionSchema),
  summary: z.object({
    question_count: z.number(),
    graded_count: z.number(),
    total_points_earned: z.number(),
    total_points_possible: z.number(),
  }),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Grade an exam submission: review each question with the student's answer and AI-suggested score, then override the overall score and write feedback. Saves via lms_grade_submission.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading submission…",
    invoked: "Submission ready to grade",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Loading submission…",
    scoreLabel: "Score (0–100)",
    aiPoints: "AI points:",
    gradedCount: (graded: string, total: string) => `${graded}/${total} graded`,
    feedbackLabel: "Feedback to student",
    feedbackPlaceholder: "Write overall feedback…",
    saving: "Saving…",
    saved: "Saved ✓",
    saveGrade: "Save grade",
    unnamedStudent: "Unnamed student",
    saveFailed: "Save failed",
    submitted: "submitted",
    studentAnswer: "Student answer",
    noAnswer: "(no answer)",
    correct: "Correct",
    incorrect: "Incorrect",
    aiFeedback: "AI feedback",
    confidenceSuffix: (pct: string) => ` (${pct} confidence)`,
    lowConfidence: (pct: string) => `${pct} confidence · review this`,
    points: (earned: string, possible: string) => `${earned}/${possible} pts`,
    notGraded: "Not graded",
    teacherAdjusted: "Teacher adjusted",
    ungradedNote: (points: string, questions: number) =>
      `${points} pts across ${questions} question${questions === 1 ? "" : "s"} not graded yet`,
    question: (n: number) => `Q${n}`,
    status: {
      teacher_reviewed: "Teacher reviewed",
      ai_reviewed: "AI reviewed",
      pending_teacher_review: "Awaiting review",
      pending: "Pending",
    } as Record<string, string>,
  },
  es: {
    loading: "Cargando entrega…",
    scoreLabel: "Nota (0–100)",
    aiPoints: "Puntos de la IA:",
    gradedCount: (graded: string, total: string) => `${graded}/${total} calificadas`,
    feedbackLabel: "Comentarios para el estudiante",
    feedbackPlaceholder: "Escribe comentarios generales…",
    saving: "Guardando…",
    saved: "Guardado ✓",
    saveGrade: "Guardar nota",
    unnamedStudent: "Estudiante sin nombre",
    saveFailed: "Error al guardar",
    submitted: "entregado el",
    studentAnswer: "Respuesta del estudiante",
    noAnswer: "(sin respuesta)",
    correct: "Correcta",
    incorrect: "Incorrecta",
    aiFeedback: "Comentarios de la IA",
    confidenceSuffix: (pct: string) => ` (confianza: ${pct})`,
    lowConfidence: (pct: string) => `confianza: ${pct} · revisa esta`,
    points: (earned: string, possible: string) => `${earned}/${possible} pts`,
    notGraded: "Sin calificar",
    teacherAdjusted: "Ajustada por el profesor",
    ungradedNote: (points: string, questions: number) =>
      `${points} pts en ${questions} pregunta${questions === 1 ? "" : "s"} sin calificar`,
    question: (n: number) => `P${n}`,
    status: {
      teacher_reviewed: "Revisado por el profesor",
      ai_reviewed: "Revisado por IA",
      pending_teacher_review: "Pendiente de revisión",
      pending: "Pendiente",
    } as Record<string, string>,
  },
};

type Strings = typeof STRINGS.en;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Below this, the AI is guessing rather than grading — the teacher should
 * re-read the answer instead of trusting the suggested score.
 */
const LOW_CONFIDENCE = 0.6;

/**
 * `points_earned: null` means nobody has graded the question — never a zero.
 * Same rule `shared/severity.ts` states for progress bars: no data and a real
 * zero are different facts and must not render alike.
 */
function isUngraded(q: Props["questions"][number]): boolean {
  return q.points_earned == null;
}

function statusPill(status: string, t: Strings): { classes: string; label: string } {
  const map: Record<string, { classes: string }> = {
    teacher_reviewed: {
      classes:
        "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400",
    },
    ai_reviewed: {
      classes:
        "bg-[var(--brand-50)] text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]",
    },
    pending_teacher_review: {
      classes:
        "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    },
    pending: {
      classes: "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
    },
  };
  const entry = map[status] ?? map.pending;
  return { classes: entry.classes, label: t.status[status] ?? t.status.pending };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SubmissionGrader() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  const [score, setScore] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  const {
    callTool: saveGrade,
    isPending: saving,
    isError: saveFailed,
    error: saveError,
  } = useCallTool<{ submission_id: number; score?: number; feedback?: string }>(
    "lms_grade_submission"
  );

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

  const { submission, questions, summary } = props;
  const status = localStatus ?? submission.review_status;
  const pill = statusPill(status, t);

  const scoreVal = score ?? (submission.score != null ? String(submission.score) : "");
  const feedbackVal = feedback ?? submission.feedback ?? "";
  const dirty =
    (score != null && score !== (submission.score != null ? String(submission.score) : "")) ||
    (feedback != null && feedback !== (submission.feedback ?? ""));

  const handleSave = () => {
    const payload: { submission_id: number; score?: number; feedback?: string } = {
      submission_id: submission.id,
    };
    const n = parseFloat(scoreVal);
    if (scoreVal !== "" && !Number.isNaN(n)) payload.score = n;
    if (feedbackVal !== (submission.feedback ?? "")) payload.feedback = feedbackVal;

    saveGrade(payload, {
      onSuccess: () => setLocalStatus("teacher_reviewed"),
    });
  };

  const studentName = studentDisplayName(submission.student_name, t.unnamedStudent);
  const saveDisabled = saving || (!dirty && status === "teacher_reviewed");

  // The summary counts only graded questions into total_points_earned, but
  // total_points_possible spans the whole exam — so "60 / 100" can read as
  // "lost 40 points" when part of that gap is simply not graded yet.
  const ungradedQuestions = questions.filter(isUngraded);
  const ungradedPoints = ungradedQuestions.reduce(
    (total, q) => total + (q.points_possible ?? 0),
    0
  );

  return (
    <McpUseProvider autoSize>
      <Brand />
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-1 flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[19px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {studentName}
              </h2>
              <div className="mt-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
                {submission.exam_title} · {t.submitted} {fmt.dateTime(submission.date)}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-[10px] px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap ${pill.classes}`}
            >
              {pill.label}
            </span>
          </div>

          {/* Grade panel */}
          <div className="my-4 rounded-xl border border-zinc-200 bg-white p-[18px] dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-end gap-[18px]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {t.scoreLabel}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreVal}
                  placeholder="—"
                  onChange={(e) => setScore(e.target.value)}
                  className="w-[90px] rounded-lg border border-zinc-200 bg-zinc-100 px-2.5 py-2 text-lg font-bold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>

              <div className="pb-2 text-[13px] text-zinc-400 dark:text-zinc-500">
                {t.aiPoints}{" "}
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {fmt.number(summary.total_points_earned)}
                  {summary.total_points_possible
                    ? ` / ${fmt.number(summary.total_points_possible)}`
                    : ""}
                </strong>{" "}
                ·{" "}
                {t.gradedCount(
                  fmt.number(summary.graded_count),
                  fmt.number(summary.question_count)
                )}
              </div>
            </div>

            {ungradedQuestions.length > 0 && (
              <div className="mt-2 text-[12.5px] font-medium text-amber-700 dark:text-amber-400">
                {t.ungradedNote(fmt.number(ungradedPoints), ungradedQuestions.length)}
              </div>
            )}

            <label className="mt-3.5 block">
              <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {t.feedbackLabel}
              </span>
              <textarea
                value={feedbackVal}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={t.feedbackPlaceholder}
                className="box-border h-[90px] w-full resize-y rounded-lg border border-zinc-200 bg-zinc-100 p-2.5 text-[13.5px] leading-normal text-zinc-900 [font-family:inherit] dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </label>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saveDisabled}
                className={`rounded-lg border-none px-5 py-2 text-[13px] font-semibold transition-all ${
                  saveDisabled
                    ? "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                    : "bg-[var(--brand-600)] text-white dark:bg-[var(--brand-400)]"
                } ${saving ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
              >
                {saving
                  ? t.saving
                  : status === "teacher_reviewed" && !dirty
                    ? t.saved
                    : t.saveGrade}
              </button>
              {saveFailed && (
                <span className="text-[13px] text-red-600 dark:text-red-400">
                  {saveError instanceof Error ? saveError.message : t.saveFailed}
                </span>
              )}
            </div>
          </div>

          {/* Questions */}
          <div className="flex flex-col gap-3">
            {questions.map((q, i) => {
              const ungraded = isUngraded(q);
              const lowConfidence =
                q.ai_confidence != null && q.ai_confidence < LOW_CONFIDENCE;
              const correct = q.is_correct;
              const badge =
                correct === true
                  ? {
                      classes:
                        "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400",
                      label: t.correct,
                    }
                  : correct === false
                    ? {
                        classes:
                          "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
                        label: t.incorrect,
                      }
                    : null;
              return (
                <div
                  key={q.question_id}
                  className={`rounded-xl border bg-white p-4 dark:bg-zinc-900 ${
                    lowConfidence
                      ? "border-amber-300 dark:border-amber-800"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-[var(--brand-600)] dark:text-[var(--brand-400)]">
                        {t.question(i + 1)}
                      </span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        {q.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {q.points_possible != null && (
                        <span
                          className={`text-xs font-semibold ${
                            ungraded
                              ? "text-zinc-400 dark:text-zinc-500"
                              : "text-zinc-900 dark:text-zinc-100"
                          }`}
                        >
                          {/* fmt.number renders null as an em dash, so an
                              ungraded question reads "—/15 pts", never "0/15". */}
                          {t.points(
                            fmt.number(q.points_earned),
                            fmt.number(q.points_possible)
                          )}
                        </span>
                      )}
                      {ungraded && (
                        <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {t.notGraded}
                        </span>
                      )}
                      {q.is_overridden && (
                        <span className="rounded-lg bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]">
                          {t.teacherAdjusted}
                        </span>
                      )}
                      {badge && (
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mb-2.5 font-medium">
                    <Markdown content={q.text} dark={dark} fontSize={14} />
                  </div>

                  {/* Options for MC/TF, highlighting the correct one */}
                  {q.options.length > 0 && (
                    <div className="mb-2.5 flex flex-col gap-1">
                      {q.options.map((o, oi) => (
                        <div
                          key={oi}
                          className={`rounded-md px-2 py-1 text-[12.5px] ${
                            o.is_correct
                              ? "bg-green-100 font-semibold text-green-600 dark:bg-green-900 dark:text-green-400"
                              : "bg-transparent font-normal text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {o.is_correct ? "✓ " : "○ "}
                          {o.text}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Student answer */}
                  <div
                    className={`rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950 ${
                      q.ai_feedback ? "mb-2" : "mb-0"
                    }`}
                  >
                    <div className="mb-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                      {t.studentAnswer}
                    </div>
                    <div className="text-[13.5px] break-words whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">
                      {q.student_answer ?? (
                        <em className="text-zinc-400 dark:text-zinc-500">{t.noAnswer}</em>
                      )}
                    </div>
                  </div>

                  {/* AI feedback + confidence */}
                  {q.ai_feedback && (
                    <div className="text-[12.5px] leading-normal text-zinc-500 dark:text-zinc-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {t.aiFeedback}
                          {/* A confident score stays inline and quiet; only a
                              guess is promoted to a pill that says so. */}
                          {q.ai_confidence != null &&
                            !lowConfidence &&
                            t.confidenceSuffix(
                              fmt.percent(Math.round(q.ai_confidence * 100))
                            )}
                        </span>
                        {q.ai_confidence != null && lowConfidence && (
                          <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            {t.lowConfidence(
                              fmt.percent(Math.round(q.ai_confidence * 100))
                            )}
                          </span>
                        )}
                      </div>
                      <Markdown content={q.ai_feedback} dark={dark} fontSize={12.5} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
}
