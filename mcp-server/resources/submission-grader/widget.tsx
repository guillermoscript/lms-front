import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(status: string): { classes: string; label: string } {
  const map: Record<string, { classes: string; label: string }> = {
    teacher_reviewed: {
      classes:
        "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400",
      label: "Teacher reviewed",
    },
    ai_reviewed: {
      classes:
        "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
      label: "AI reviewed",
    },
    pending_teacher_review: {
      classes:
        "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
      label: "Awaiting review",
    },
    pending: {
      classes: "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
      label: "Pending",
    },
  };
  return map[status] ?? map.pending;
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SubmissionGrader() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

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
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Loading submission…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { submission, questions, summary } = props;
  const status = localStatus ?? submission.review_status;
  const pill = statusPill(status);

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

  const studentName = submission.student_name ?? submission.student_id.slice(0, 8);
  const saveDisabled = saving || (!dirty && status === "teacher_reviewed");

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-1 flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[19px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {studentName}
              </h2>
              <div className="mt-0.5 text-[13px] text-zinc-400 dark:text-zinc-500">
                {submission.exam_title} · submitted {formatDate(submission.date)}
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
                  Score (0–100)
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
                AI points:{" "}
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {summary.total_points_earned}
                  {summary.total_points_possible ? ` / ${summary.total_points_possible}` : ""}
                </strong>{" "}
                · {summary.graded_count}/{summary.question_count} graded
              </div>
            </div>

            <label className="mt-3.5 block">
              <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Feedback to student
              </span>
              <textarea
                value={feedbackVal}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Write overall feedback…"
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
                    : "bg-violet-600 text-white dark:bg-violet-400"
                } ${saving ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
              >
                {saving
                  ? "Saving…"
                  : status === "teacher_reviewed" && !dirty
                    ? "Saved ✓"
                    : "Save grade"}
              </button>
              {saveFailed && (
                <span className="text-[13px] text-red-600 dark:text-red-400">
                  {saveError instanceof Error ? saveError.message : "Save failed"}
                </span>
              )}
            </div>
          </div>

          {/* Questions */}
          <div className="flex flex-col gap-3">
            {questions.map((q, i) => {
              const correct = q.is_correct;
              const badge =
                correct === true
                  ? {
                      classes:
                        "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400",
                      label: "Correct",
                    }
                  : correct === false
                    ? {
                        classes:
                          "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
                        label: "Incorrect",
                      }
                    : null;
              return (
                <div
                  key={q.question_id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-2 flex items-start justify-between gap-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
                        Q{i + 1}
                      </span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        {q.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {q.points_possible != null && (
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {q.points_earned ?? 0}/{q.points_possible} pts
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
                      Student answer
                    </div>
                    <div className="text-[13.5px] break-words whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">
                      {q.student_answer ?? (
                        <em className="text-zinc-400 dark:text-zinc-500">(no answer)</em>
                      )}
                    </div>
                  </div>

                  {/* AI feedback + confidence */}
                  {q.ai_feedback && (
                    <div className="text-[12.5px] leading-normal text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold">
                        AI feedback
                        {q.ai_confidence != null &&
                          ` (${Math.round(q.ai_confidence * 100)}% confidence)`}
                      </span>
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
