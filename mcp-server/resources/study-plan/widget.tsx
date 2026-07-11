import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// Props produced by lms_get_study_plan (Epic #348 Phase 4, #359).
const propsSchema = z.object({
  week_start: z.string().describe("Monday of the plan's week, YYYY-MM-DD"),
  goals: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      kind: z.enum(["lesson", "practice", "review", "exam_prep", "custom"]),
      course_id: z.number().nullable(),
      done: z.boolean(),
      done_at: z.string().nullable(),
    })
  ),
  progress: z.number().describe("Percent of goals done, 0-100"),
  context: z.object({
    next_lessons: z.array(
      z.object({
        course_id: z.number(),
        course_title: z.string(),
        lesson_id: z.number(),
        lesson_title: z.string(),
      })
    ),
    due_reviews: z.number(),
  }),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Weekly study plan: progress ring, goal checklist grouped by kind with check-off, planning context (next lessons, due flashcards), and a plan-next-week action.",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading your study plan...",
    invoked: "Study plan ready",
  },
};

type Props = z.infer<typeof propsSchema>;
type Goal = Props["goals"][number];

const KIND_META: Record<Goal["kind"], { label: string; icon: string }> = {
  lesson: { label: "Lessons", icon: "📖" },
  practice: { label: "Practice", icon: "✏️" },
  review: { label: "Review", icon: "🔁" },
  exam_prep: { label: "Exam prep", icon: "📄" },
  custom: { label: "Other", icon: "🎯" },
};
const KIND_ORDER: Goal["kind"][] = ["lesson", "practice", "review", "exam_prep", "custom"];

export default function StudyPlan() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const { callTool } = useCallTool("lms_complete_study_goal");
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
  };

  // Optimistic check-off: goal ids marked done locally while the tool runs.
  const [checked, setChecked] = useState<Set<number>>(new Set());

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

  const { week_start, goals, context } = props;
  const isDone = (g: Goal) => g.done || checked.has(g.id);
  const doneCount = goals.filter(isDone).length;
  const progress = goals.length > 0 ? Math.round((doneCount / goals.length) * 100) : 0;
  const allDone = goals.length > 0 && doneCount === goals.length;

  const weekLabel = new Date(`${week_start}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const check = (g: Goal) => {
    if (isDone(g)) return;
    setChecked((s) => new Set(s).add(g.id));
    callTool({ goal_id: g.id });
  };

  // Progress ring geometry (SVG circle, r=26).
  const R = 26;
  const CIRC = 2 * Math.PI * R;

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 20,
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <svg width={64} height={64} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
            <circle
              cx={32}
              cy={32}
              r={R}
              fill="none"
              stroke={dark ? "#27272a" : "#f3f4f6"}
              strokeWidth={6}
            />
            <circle
              cx={32}
              cy={32}
              r={R}
              fill="none"
              stroke={allDone ? colors.pass : colors.accent}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress / 100)}
              transform="rotate(-90 32 32)"
            />
            <text
              x={32}
              y={37}
              textAnchor="middle"
              style={{ fontSize: 14, fontWeight: 800, fill: colors.text }}
            >
              {progress}%
            </text>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: colors.text }}>
              Week of {weekLabel}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.textSecondary }}>
              {goals.length === 0
                ? "No goals yet this week"
                : `${doneCount} of ${goals.length} goals done`}
              {context.due_reviews > 0 ? ` · ${context.due_reviews} flashcards due` : ""}
            </p>
          </div>
        </div>

        {allDone && (
          <div
            style={{
              backgroundColor: dark ? "#14532d" : "#dcfce7",
              border: `1px solid ${colors.pass}`,
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 22 }}>🎉</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.pass }}>
              Week complete — every goal done!
            </span>
          </div>
        )}

        {goals.length === 0 ? (
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 32,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 8 }}>🗓️</div>
            <p style={{ margin: 0, color: colors.text, fontWeight: 600, fontSize: 15 }}>
              Nothing planned yet
            </p>
            {context.next_lessons.length > 0 && (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: colors.textSecondary }}>
                Up next:{" "}
                {context.next_lessons
                  .slice(0, 3)
                  .map((l) => `"${l.lesson_title}" (${l.course_title})`)
                  .join(" · ")}
              </p>
            )}
            <button
              onClick={() =>
                sendFollowUpMessage(
                  "Help me plan this week: propose study goals from my next lessons, weak spots, and due flashcards, then save them with lms_set_study_plan."
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
              Plan my week
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
            {KIND_ORDER.filter((k) => goals.some((g) => g.kind === k)).map((kind) => (
              <div key={kind}>
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: colors.textMuted,
                  }}
                >
                  {KIND_META[kind].icon} {KIND_META[kind].label}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {goals
                    .filter((g) => g.kind === kind)
                    .map((g) => {
                      const done = isDone(g);
                      return (
                        <button
                          key={g.id}
                          onClick={() => check(g)}
                          disabled={done}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            textAlign: "left",
                            backgroundColor: colors.surface,
                            border: `1px solid ${done ? colors.pass : colors.border}`,
                            borderRadius: 10,
                            padding: "10px 14px",
                            cursor: done ? "default" : "pointer",
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#ffffff",
                              backgroundColor: done ? colors.pass : "transparent",
                              border: done ? "none" : `2px solid ${colors.textMuted}`,
                            }}
                          >
                            {done ? "✓" : ""}
                          </span>
                          <span
                            style={{
                              fontSize: 14,
                              color: done ? colors.textMuted : colors.text,
                              textDecoration: done ? "line-through" : "none",
                            }}
                          >
                            {g.title}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}

        {goals.length > 0 && (
          <button
            onClick={() =>
              sendFollowUpMessage(
                "Let's plan next week: look at what I finished and missed this week, my next lessons, and due flashcards, then propose next week's goals and save them with lms_set_study_plan."
              )
            }
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: colors.accent,
              backgroundColor: "transparent",
              border: `1px solid ${colors.accent}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Plan next week with me
          </button>
        )}
      </div>
    </McpUseProvider>
  );
}
