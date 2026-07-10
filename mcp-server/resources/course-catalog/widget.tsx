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
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  tags: z.union([z.array(z.string()), z.string(), z.null()]),
  lesson_count: z.number(),
  enrolled: z.boolean(),
  covered_by_plan: z.boolean(),
});

const propsSchema = z.object({
  total: z.number(),
  has_subscription: z.boolean(),
  courses: z.array(courseSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "School course catalog grid showing which courses the student has access to and which their plan covers",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Browsing catalog...",
    invoked: "Catalog ready",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTags(tags: string[] | string | null): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CourseCatalog() {
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
    enrolled: dark ? "#4ade80" : "#16a34a",
    enrolledBg: dark ? "#14532d" : "#dcfce7",
    tagBg: dark ? "#27272a" : "#f4f4f5",
    thumbBg: dark ? "#27272a" : "#f4f4f5",
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
          <p style={{ margin: 0, fontSize: 14 }}>Browsing catalog…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { total, has_subscription, courses } = props;

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
          maxWidth: 820,
          margin: "0 auto",
        }}
      >
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
            Course Catalog
          </h1>
          <span style={{ fontSize: 13, color: colors.textSecondary }}>
            {total} published course{total === 1 ? "" : "s"}
            {has_subscription ? " · subscription active" : ""}
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
            <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
            <p style={{ margin: 0, color: colors.text, fontWeight: 600, fontSize: 15 }}>
              No published courses found
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
              gap: 14,
            }}
          >
            {courses.map((course) => {
              const tags = normalizeTags(course.tags).slice(0, 3);
              return (
                <div
                  key={course.id}
                  style={{
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    style={{
                      height: 96,
                      backgroundColor: colors.thumbBg,
                      backgroundImage: course.thumbnail_url
                        ? `url(${course.thumbnail_url})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 28,
                    }}
                  >
                    {!course.thumbnail_url && "📖"}
                  </div>

                  <div
                    style={{
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      flex: 1,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 14.5,
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
                            fontSize: 12,
                            color: colors.textMuted,
                            marginTop: 4,
                            lineHeight: 1.45,
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

                    {tags.length > 0 && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 8,
                              fontSize: 10.5,
                              fontWeight: 600,
                              backgroundColor: colors.tagBg,
                              color: colors.textSecondary,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: "auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: colors.textMuted }}>
                        {course.lesson_count} lesson
                        {course.lesson_count === 1 ? "" : "s"}
                      </span>
                      {course.enrolled ? (
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: colors.enrolledBg,
                            color: colors.enrolled,
                          }}
                        >
                          ✓ Enrolled
                        </span>
                      ) : course.covered_by_plan ? (
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: colors.accentBg,
                            color: colors.accent,
                          }}
                        >
                          In your plan
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: colors.textMuted }}>
                          Not in plan
                        </span>
                      )}
                    </div>
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
