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

export default function ExamReadiness() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const colors = {
    bg: dark ? "#0f0f0f" : "#fafafa",
    surface: dark ? "#1a1a1a" : "#ffffff",
    border: dark ? "#2a2a2a" : "#e5e7eb",
    text: dark ? "#f4f4f5" : "#111827",
    textSecondary: dark ? "#a1a1aa" : "#6b7280",
    textMuted: dark ? "#71717a" : "#9ca3af",
    accent: dark ? "#a78bfa" : "#7c3aed",
    pass: dark ? "#4ade80" : "#16a34a",
    passBg: dark ? "#14532d" : "#dcfce7",
    warn: dark ? "#fbbf24" : "#d97706",
    warnBg: dark ? "#451a03" : "#fef3c7",
    fail: dark ? "#f87171" : "#dc2626",
    failBg: dark ? "#450a0a" : "#fee2e2",
  };

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div
          style={{
            fontFamily: "system-ui, -apple-system, sans-serif",
            padding: 40,
            display: "flex",
            justifyContent: "center",
            backgroundColor: colors.bg,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: `3px solid ${colors.border}`,
              borderTopColor: colors.accent,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </McpUseProvider>
    );
  }

  const { course_title, exam, readiness, components, formula, topics, lessons } =
    props;

  const bandColor = (v: number) =>
    v >= 80 ? colors.pass : v >= 60 ? colors.warn : colors.fail;
  const bandBg = (v: number) =>
    v >= 80 ? colors.passBg : v >= 60 ? colors.warnBg : colors.failBg;

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
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.text }}>
            Exam readiness — {course_title}
          </h2>
          {exam && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.textSecondary }}>
              {exam.title}
              {examDate ? ` · ${examDate}` : ""}
            </p>
          )}
        </div>

        {readiness === null ? (
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧭</div>
            <p style={{ margin: 0, color: colors.text, fontWeight: 600, fontSize: 15 }}>
              No signal yet
            </p>
            <p style={{ margin: "6px 0 0", color: colors.textMuted, fontSize: 13 }}>
              Take a practice quiz to calibrate your readiness.
            </p>
            <button
              onClick={() =>
                sendFollowUpMessage(
                  `Generate a diagnostic practice quiz for "${course_title}" with lms_practice_quiz so we can calibrate my exam readiness.`
                )
              }
              style={{
                marginTop: 16,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "#ffffff",
                backgroundColor: colors.accent,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Start a diagnostic quiz
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: 20,
                display: "flex",
                alignItems: "center",
                gap: 20,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  border: `6px solid ${bandColor(readiness)}`,
                  backgroundColor: bandBg(readiness),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 26, fontWeight: 800, color: bandColor(readiness) }}>
                  {readiness}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  {componentChips.map((c) => (
                    <span
                      key={c.label}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: `1px solid ${colors.border}`,
                        color: c.value === null ? colors.textMuted : colors.text,
                        backgroundColor: colors.bg,
                      }}
                    >
                      {c.label}: {c.value === null ? "n/a" : c.value}
                      {c.value !== null && c.weight > 0
                        ? ` (${Math.round(c.weight * 100)}%)`
                        : ""}
                    </span>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>{formula}</p>
              </div>
            </div>

            {topics.length === 0 ? (
              <div
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  padding: 24,
                  textAlign: "center",
                }}
              >
                <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>
                  No per-topic history yet — practice quizzes and exam attempts will
                  show up here.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topics.map((t, i) => (
                  <div
                    key={`${t.label}-${i}`}
                    style={{
                      backgroundColor: colors.surface,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 10,
                      padding: "12px 16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: colors.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.source === "exam" ? "📄 " : "✏️ "}
                        {t.label}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: bandColor(t.mastery) }}>
                          {t.mastery}
                        </span>
                        <button
                          onClick={() =>
                            sendFollowUpMessage(
                              `Generate a practice quiz on "${t.label}" with lms_practice_quiz — focus on my misses. (Course: ${course_title})`
                            )
                          }
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.accent,
                            backgroundColor: "transparent",
                            border: `1px solid ${colors.accent}`,
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          Practice this
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: dark ? "#27272a" : "#f3f4f6",
                        overflow: "hidden",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, t.mastery))}%`,
                          height: "100%",
                          borderRadius: 3,
                          backgroundColor: bandColor(t.mastery),
                        }}
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>
                      {t.evidence}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </McpUseProvider>
  );
}
