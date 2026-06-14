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

function progressColor(pct: number | null, dark: boolean): string {
  if (pct == null) return dark ? "#52525b" : "#d4d4d8";
  if (pct >= 80) return dark ? "#22c55e" : "#16a34a";
  if (pct >= 40) return dark ? "#a78bfa" : "#7c3aed";
  if (pct > 0) return dark ? "#f59e0b" : "#d97706";
  return dark ? "#ef4444" : "#dc2626";
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
    track: dark ? "#27272a" : "#f1f5f9",
    riskBg: dark ? "#7f1d1d" : "#fee2e2",
    riskText: dark ? "#fca5a5" : "#991b1b",
    avatarBg: dark ? "#27272a" : "#ede9fe",
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
          <p style={{ margin: 0, fontSize: 14 }}>Loading roster…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { course, students, summary } = props;
  const visible = atRiskOnly ? students.filter((s) => s.at_risk) : students;

  const stat = (label: string, value: string, accent?: string) => (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? colors.text }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  );

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
        <div style={{ marginBottom: 4 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 700,
              color: colors.text,
              letterSpacing: "-0.01em",
            }}
          >
            {course.title}
          </h2>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
            Student roster · {course.published_lessons} published lesson
            {course.published_lessons === 1 ? "" : "s"}
          </div>
        </div>

        {/* Summary */}
        <div
          style={{
            display: "flex",
            gap: 24,
            padding: "14px 18px",
            margin: "14px 0",
            borderRadius: 12,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            width: "fit-content",
          }}
        >
          {stat("Students", String(summary.total))}
          {stat("Avg progress", `${summary.avg_progress}%`, colors.accent)}
          {stat(
            "At risk",
            String(summary.at_risk),
            summary.at_risk > 0 ? colors.riskText : colors.text
          )}
        </div>

        {/* Filter */}
        {summary.at_risk > 0 && (
          <button
            onClick={() => setAtRiskOnly((v) => !v)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: `1px solid ${atRiskOnly ? colors.riskText : colors.border}`,
              backgroundColor: atRiskOnly ? colors.riskBg : "transparent",
              color: atRiskOnly ? colors.riskText : colors.textSecondary,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            {atRiskOnly ? "✓ At risk only" : "Show at risk only"}
          </button>
        )}

        {/* Rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((s: Student) => {
            const pct = s.progress_pct;
            const name = s.student_name ?? s.student_id.slice(0, 8);
            return (
              <div
                key={s.student_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  borderRadius: 12,
                  backgroundColor: colors.surface,
                  border: `1px solid ${s.at_risk ? (dark ? "#7f1d1d" : "#fecaca") : colors.border}`,
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    backgroundColor: colors.avatarBg,
                    color: colors.accent,
                    fontSize: 13,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    textTransform: "uppercase",
                  }}
                >
                  {initials(s.student_name, s.student_id)}
                </div>

                {/* Name + progress bar */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
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
                      {name}
                    </span>
                    {s.at_risk && (
                      <span
                        style={{
                          padding: "1px 7px",
                          borderRadius: 6,
                          fontSize: 10.5,
                          fontWeight: 700,
                          backgroundColor: colors.riskBg,
                          color: colors.riskText,
                          flexShrink: 0,
                        }}
                      >
                        AT RISK
                      </span>
                    )}
                    {s.status !== "active" && (
                      <span style={{ fontSize: 11, color: colors.textMuted, flexShrink: 0 }}>
                        {s.status}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.track,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct ?? 0}%`,
                        backgroundColor: progressColor(pct, dark),
                        borderRadius: 3,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>

                {/* Metrics */}
                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 56 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
                    {pct == null ? "—" : `${pct}%`}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>
                    {s.completed_lessons}/{course.published_lessons} lessons
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 64 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
                    {s.exam_avg == null ? "—" : `${s.exam_avg}%`}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>
                    {s.exam_count} exam{s.exam_count === 1 ? "" : "s"}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>
                    {relativeDate(s.last_active)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>last active</div>
                </div>
              </div>
            );
          })}

          {visible.length === 0 && (
            <p
              style={{
                margin: 0,
                padding: 24,
                textAlign: "center",
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              {atRiskOnly ? "No at-risk students. 🎉" : "No students enrolled."}
            </p>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
