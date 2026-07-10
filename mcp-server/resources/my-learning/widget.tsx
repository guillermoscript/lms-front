import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const nextLessonSchema = z.object({
  id: z.number(),
  title: z.string(),
  sequence: z.number(),
});

const courseSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  enrolled_at: z.string(),
  lessons_total: z.number(),
  lessons_completed: z.number(),
  progress: z.number(),
  next_lesson: nextLessonSchema.nullable(),
});

const propsSchema = z.object({
  total: z.number(),
  average_progress: z.number(),
  courses: z.array(courseSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Student learning dashboard: enrolled courses with progress bars and the next lesson to take",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading your courses...",
    invoked: "Learning dashboard ready",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Component ────────────────────────────────────────────────────────────────

export default function MyLearning() {
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
    accentBg: dark ? "#2e1065" : "#f5f3ff",
    track: dark ? "#27272a" : "#f4f4f5",
    done: dark ? "#4ade80" : "#16a34a",
    doneBg: dark ? "#14532d" : "#dcfce7",
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
          <p style={{ margin: 0, fontSize: 14 }}>Loading your courses…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { total, average_progress, courses } = props;

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 18,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: colors.text,
              letterSpacing: "-0.02em",
            }}
          >
            My Learning
          </h1>
          <span style={{ fontSize: 13, color: colors.textSecondary }}>
            {total} course{total === 1 ? "" : "s"} · {average_progress}% average
            progress
          </span>
        </div>

        {courses.length === 0 ? (
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎓</div>
            <p style={{ margin: 0, color: colors.text, fontWeight: 600, fontSize: 15 }}>
              No enrolled courses yet
            </p>
            <p style={{ margin: "6px 0 0", color: colors.textMuted, fontSize: 13 }}>
              Browse the catalog to find your first course.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {courses.map((course) => {
              const done = course.progress >= 100;
              return (
                <div
                  key={course.id}
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
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 650,
                          color: colors.text,
                          lineHeight: 1.3,
                        }}
                      >
                        {course.title}
                      </div>
                      {course.description && (
                        <div
                          style={{
                            fontSize: 12.5,
                            color: colors.textMuted,
                            marginTop: 3,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {course.description}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        backgroundColor: done ? colors.doneBg : colors.accentBg,
                        color: done ? colors.done : colors.accent,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {course.progress}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div
                    style={{
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: colors.track,
                      overflow: "hidden",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(course.progress, 100)}%`,
                        borderRadius: 999,
                        backgroundColor: done ? colors.done : colors.accent,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 12, color: colors.textSecondary }}>
                      {course.lessons_completed}/{course.lessons_total} lessons
                      completed
                    </span>
                    {done ? (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: colors.done,
                        }}
                      >
                        ✓ Course complete
                      </span>
                    ) : course.next_lesson ? (
                      <span
                        style={{
                          fontSize: 12,
                          color: colors.textSecondary,
                          backgroundColor: colors.track,
                          borderRadius: 8,
                          padding: "3px 8px",
                        }}
                      >
                        Next: Lesson {course.next_lesson.sequence} ·{" "}
                        {course.next_lesson.title}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
