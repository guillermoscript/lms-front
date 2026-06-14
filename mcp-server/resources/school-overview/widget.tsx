import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(status: string, theme: "light" | "dark") {
  const dark = theme === "dark";
  switch (status.toLowerCase()) {
    case "published":
      return { bg: dark ? "#14532d" : "#dcfce7", text: dark ? "#86efac" : "#166534" };
    case "draft":
      return { bg: dark ? "#3f3f46" : "#f4f4f5", text: dark ? "#a1a1aa" : "#52525b" };
    case "archived":
      return { bg: dark ? "#1e1b4b" : "#ede9fe", text: dark ? "#a5b4fc" : "#4338ca" };
    default:
      return { bg: dark ? "#422006" : "#fef3c7", text: dark ? "#fcd34d" : "#92400e" };
  }
}

function completionColor(pct: number, dark: boolean): string {
  if (pct >= 80) return dark ? "#22c55e" : "#16a34a";
  if (pct >= 40) return dark ? "#a78bfa" : "#7c3aed";
  if (pct > 0) return dark ? "#f59e0b" : "#d97706";
  return dark ? "#52525b" : "#d4d4d8";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SchoolOverview() {
  const { props, isPending } = useWidget<Props>();
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
    track: dark ? "#27272a" : "#f1f5f9",
    riskText: dark ? "#fca5a5" : "#dc2626",
    sectionBg: dark ? "#141414" : "#f9fafb",
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
          <p style={{ margin: 0, fontSize: 14 }}>Crunching school stats…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { school, courses } = props;

  const kpi = (
    label: string,
    value: string,
    sub?: string,
    accent?: string
  ) => (
    <div
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? colors.text, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: 500 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{sub}</div>}
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
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: colors.text,
              letterSpacing: "-0.01em",
            }}
          >
            {school.name}
          </h2>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
            School overview
          </div>
        </div>

        {/* KPI grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: 22,
          }}
        >
          {kpi(
            "Courses",
            String(school.courses_total),
            `${school.courses_published} published · ${school.courses_draft} draft`
          )}
          {kpi("Students", String(school.students), `${school.active_enrollments} active enrollments`)}
          {kpi("Published lessons", String(school.published_lessons))}
          {kpi("Avg completion", `${school.completion_rate}%`, undefined, colors.accent)}
          {kpi(
            "Avg exam score",
            school.avg_exam_score == null ? "—" : `${school.avg_exam_score}%`,
            `${school.exam_submissions} submissions`
          )}
          {kpi(
            "At-risk students",
            String(school.at_risk_students),
            "active · 0 lessons done",
            school.at_risk_students > 0 ? colors.riskText : colors.text
          )}
        </div>

        {/* Per-course breakdown */}
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: 14,
            fontWeight: 600,
            color: colors.text,
          }}
        >
          Courses ({courses.length})
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {courses.map((c: Course) => {
            const pill = statusPill(c.status, theme);
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 14px",
                  borderRadius: 12,
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                }}
              >
                {/* Title + status + completion bar */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
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
                      {c.title}
                    </span>
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 7,
                        fontSize: 10.5,
                        fontWeight: 600,
                        backgroundColor: pill.bg,
                        color: pill.text,
                        flexShrink: 0,
                      }}
                    >
                      {c.status}
                    </span>
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
                        width: `${c.completion_rate}%`,
                        backgroundColor: completionColor(c.completion_rate, dark),
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 64 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
                    {c.active_enrollments}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>enrolled</div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 56 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
                    {c.completion_rate}%
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>
                    {c.published_lessons} lesson{c.published_lessons === 1 ? "" : "s"}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 56 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
                    {c.exam_avg == null ? "—" : `${c.exam_avg}%`}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>exam avg</div>
                </div>
              </div>
            );
          })}

          {courses.length === 0 && (
            <p style={{ margin: 0, padding: 24, textAlign: "center", fontSize: 13, color: colors.textMuted }}>
              No courses yet.
            </p>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
