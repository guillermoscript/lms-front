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

function statusPill(
  status: string,
  theme: "light" | "dark"
): { bg: string; text: string; label: string } {
  const dark = theme === "dark";
  const map: Record<string, { bg: string; text: string; label: string }> = {
    teacher_reviewed: {
      bg: dark ? "#14532d" : "#dcfce7",
      text: dark ? "#86efac" : "#166534",
      label: "Teacher reviewed",
    },
    ai_reviewed: {
      bg: dark ? "#1e1b4b" : "#ede9fe",
      text: dark ? "#a5b4fc" : "#4338ca",
      label: "AI reviewed",
    },
    pending_teacher_review: {
      bg: dark ? "#422006" : "#fef3c7",
      text: dark ? "#fcd34d" : "#92400e",
      label: "Awaiting review",
    },
    pending: {
      bg: dark ? "#3f3f46" : "#f4f4f5",
      text: dark ? "#a1a1aa" : "#52525b",
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

  const colors = {
    bg: dark ? "#0f0f0f" : "#fafafa",
    surface: dark ? "#1a1a1a" : "#ffffff",
    border: dark ? "#2a2a2a" : "#e5e7eb",
    text: dark ? "#f4f4f5" : "#111827",
    textSecondary: dark ? "#a1a1aa" : "#6b7280",
    textMuted: dark ? "#71717a" : "#9ca3af",
    accent: dark ? "#a78bfa" : "#7c3aed",
    accentBg: dark ? "#2e1065" : "#f5f3ff",
    sectionBg: dark ? "#141414" : "#f9fafb",
    answerBg: dark ? "#11203a" : "#eff6ff",
    answerBorder: dark ? "#1e3a5f" : "#bfdbfe",
    codeBg: dark ? "#0a0a0a" : "#f6f8fa",
    okBg: dark ? "#14532d" : "#dcfce7",
    okText: dark ? "#86efac" : "#166534",
    errBg: dark ? "#7f1d1d" : "#fee2e2",
    errText: dark ? "#fca5a5" : "#991b1b",
  };

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: colors.textMuted,
            backgroundColor: colors.bg,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: `3px solid ${colors.border}`,
              borderTop: `3px solid ${colors.accent}`,
              borderRadius: "50%",
              margin: "0 auto 12px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ margin: 0, fontSize: 14 }}>Loading submission…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { submission, questions, summary } = props;
  const status = localStatus ?? submission.review_status;
  const pill = statusPill(status, theme);

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

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 700,
                color: colors.text,
                letterSpacing: "-0.01em",
              }}
            >
              {studentName}
            </h2>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
              {submission.exam_title} · submitted {formatDate(submission.date)}
            </div>
          </div>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: pill.bg,
              color: pill.text,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {pill.label}
          </span>
        </div>

        {/* Grade panel */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 18,
            margin: "16px 0",
          }}
        >
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "block" }}>
              <span
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.textSecondary,
                  marginBottom: 6,
                }}
              >
                Score (0–100)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={scoreVal}
                placeholder="—"
                onChange={(e) => setScore(e.target.value)}
                style={{
                  width: 90,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.codeBg,
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: 700,
                }}
              />
            </label>

            <div style={{ fontSize: 13, color: colors.textMuted, paddingBottom: 8 }}>
              AI points: <strong style={{ color: colors.text }}>
                {summary.total_points_earned}
                {summary.total_points_possible ? ` / ${summary.total_points_possible}` : ""}
              </strong>{" "}
              · {summary.graded_count}/{summary.question_count} graded
            </div>
          </div>

          <label style={{ display: "block", marginTop: 14 }}>
            <span
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: colors.textSecondary,
                marginBottom: 6,
              }}
            >
              Feedback to student
            </span>
            <textarea
              value={feedbackVal}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Write overall feedback…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 90,
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.codeBg,
                color: colors.text,
                fontSize: 13.5,
                lineHeight: 1.5,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button
              onClick={handleSave}
              disabled={saving || (!dirty && status === "teacher_reviewed")}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                backgroundColor:
                  saving || (!dirty && status === "teacher_reviewed")
                    ? colors.border
                    : colors.accent,
                color:
                  saving || (!dirty && status === "teacher_reviewed")
                    ? colors.textMuted
                    : "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                transition: "all 0.15s",
              }}
            >
              {saving
                ? "Saving…"
                : status === "teacher_reviewed" && !dirty
                  ? "Saved ✓"
                  : "Save grade"}
            </button>
            {saveFailed && (
              <span style={{ fontSize: 13, color: colors.errText }}>
                {saveError instanceof Error ? saveError.message : "Save failed"}
              </span>
            )}
          </div>
        </div>

        {/* Questions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.map((q, i) => {
            const correct = q.is_correct;
            const badge =
              correct === true
                ? { bg: colors.okBg, text: colors.okText, label: "Correct" }
                : correct === false
                  ? { bg: colors.errBg, text: colors.errText, label: "Incorrect" }
                  : null;
            return (
              <div
                key={q.question_id}
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: colors.accent,
                      }}
                    >
                      Q{i + 1}
                    </span>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>
                      {q.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    {q.points_possible != null && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
                        {q.points_earned ?? 0}/{q.points_possible} pts
                      </span>
                    )}
                    {badge && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: badge.bg,
                          color: badge.text,
                        }}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>

                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 14,
                    color: colors.text,
                    lineHeight: 1.5,
                    fontWeight: 500,
                  }}
                >
                  {q.text}
                </p>

                {/* Options for MC/TF, highlighting the correct one */}
                {q.options.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    {q.options.map((o, oi) => (
                      <div
                        key={oi}
                        style={{
                          fontSize: 12.5,
                          padding: "4px 8px",
                          borderRadius: 6,
                          color: o.is_correct ? colors.okText : colors.textSecondary,
                          backgroundColor: o.is_correct ? colors.okBg : "transparent",
                          fontWeight: o.is_correct ? 600 : 400,
                        }}
                      >
                        {o.is_correct ? "✓ " : "○ "}
                        {o.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Student answer */}
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    backgroundColor: colors.answerBg,
                    border: `1px solid ${colors.answerBorder}`,
                    marginBottom: q.ai_feedback ? 8 : 0,
                  }}
                >
                  <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 2 }}>
                    Student answer
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      color: colors.text,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {q.student_answer ?? <em style={{ color: colors.textMuted }}>(no answer)</em>}
                  </div>
                </div>

                {/* AI feedback + confidence */}
                {q.ai_feedback && (
                  <div style={{ fontSize: 12.5, color: colors.textSecondary, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600 }}>AI feedback: </span>
                    {q.ai_feedback}
                    {q.ai_confidence != null && (
                      <span style={{ color: colors.textMuted }}>
                        {" "}
                        ({Math.round(q.ai_confidence * 100)}% confidence)
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </McpUseProvider>
  );
}
