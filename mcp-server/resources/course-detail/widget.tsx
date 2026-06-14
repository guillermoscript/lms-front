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

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusPill(
  status: string,
  theme: "light" | "dark"
): { bg: string; text: string } {
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

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
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
    statsBg: dark ? "#1c1c1c" : "#f0fdf4",
    statsBorder: dark ? "#166534" : "#bbf7d0",
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
          <p style={{ margin: 0, fontSize: 14 }}>Loading course…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { course, lessons, exams } = props;
  const pill = statusPill(course.status, theme);
  const stats = parseCourseStats(statsData?.structuredContent);

  const handleLoadStats = () => {
    setStatsVisible(true);
    loadStats({ course_id: course.id });
  };

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
        }}
      >
        {/* Course header */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: colors.text,
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
              }}
            >
              {course.title}
            </h2>
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
              {course.status}
            </span>
          </div>

          {course.description && (
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 14,
                color: colors.textSecondary,
                lineHeight: 1.6,
              }}
            >
              {course.description}
            </p>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: colors.textMuted }}>
              👥 {course.enrollment_count} enrolled
            </span>
            <span style={{ fontSize: 13, color: colors.textMuted }}>
              📅 Created {formatDate(course.created_at)}
            </span>
            {course.require_sequential_completion && (
              <span style={{ fontSize: 13, color: colors.textMuted }}>🔒 Sequential</span>
            )}
          </div>

          {/* Load stats button */}
          <button
            onClick={handleLoadStats}
            disabled={statsLoading}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: `1px solid ${colors.accent}`,
              backgroundColor: statsVisible ? colors.accentBg : "transparent",
              color: colors.accent,
              fontSize: 13,
              fontWeight: 500,
              cursor: statsLoading ? "not-allowed" : "pointer",
              opacity: statsLoading ? 0.7 : 1,
              transition: "all 0.15s",
            }}
          >
            {statsLoading ? "Loading stats…" : "Load stats"}
          </button>

          {/* Stats row */}
          {statsVisible && stats && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 10,
                backgroundColor: colors.statsBg,
                border: `1px solid ${colors.statsBorder}`,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                gap: 12,
              }}
            >
              {[
                { label: "Active enrollments", value: stats.active_enrollments },
                { label: "Published lessons", value: stats.published_lessons },
                {
                  label: "Completion rate",
                  value:
                    stats.lesson_completion_rate != null
                      ? `${Math.round(stats.lesson_completion_rate)}%`
                      : undefined,
                },
                { label: "Exams", value: stats.exam_count },
                { label: "Submissions", value: stats.submission_count },
                {
                  label: "Avg score",
                  value:
                    stats.average_score != null
                      ? `${Math.round(stats.average_score)}%`
                      : undefined,
                },
              ]
                .filter((s) => s.value !== undefined)
                .map(({ label, value }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: dark ? "#86efac" : "#15803d",
                      }}
                    >
                      {value}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                      {label}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Lessons */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 18,
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              margin: "0 0 14px",
              fontSize: 15,
              fontWeight: 600,
              color: colors.text,
            }}
          >
            Lessons ({lessons.length})
          </h3>

          {lessons.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
              No lessons yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lessons
                .slice()
                .sort((a, b) => a.sequence - b.sequence)
                .map((lesson) => {
                  const lp = statusPill(lesson.status, theme);
                  return (
                    <div
                      key={lesson.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        backgroundColor: colors.sectionBg,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 24,
                          height: 24,
                          borderRadius: "50%",
                          backgroundColor: colors.accentBg,
                          color: colors.accent,
                          fontSize: 11,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {lesson.sequence}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: colors.text,
                          fontWeight: 500,
                        }}
                      >
                        {lesson.title}
                      </span>
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: lp.bg,
                          color: lp.text,
                          flexShrink: 0,
                        }}
                      >
                        {lesson.status}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Exams */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 18,
          }}
        >
          <h3
            style={{
              margin: "0 0 14px",
              fontSize: 15,
              fontWeight: 600,
              color: colors.text,
            }}
          >
            Exams ({exams.length})
          </h3>

          {exams.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
              No exams yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {exams.map((exam) => {
                const ep = statusPill(exam.status, theme);
                return (
                  <div
                    key={exam.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      backgroundColor: colors.sectionBg,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: colors.text,
                        fontWeight: 500,
                        minWidth: 100,
                      }}
                    >
                      {exam.title}
                    </span>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>
                      ⏱ {exam.duration} min
                    </span>
                    {exam.date && (
                      <span style={{ fontSize: 12, color: colors.textMuted }}>
                        📅 {formatDate(exam.date)}
                      </span>
                    )}
                    <span
                      style={{
                        padding: "2px 7px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: ep.bg,
                        color: ep.text,
                      }}
                    >
                      {exam.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
