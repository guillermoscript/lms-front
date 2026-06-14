import { useState } from "react";
import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const courseItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  tags: z.union([z.array(z.string()), z.string(), z.null()]),
  lesson_count: z.number(),
  enrollment_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const propsSchema = z.object({
  status: z.string(),
  total: z.number(),
  courses: z.array(courseItemSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display a grid of LMS courses with status pills and metadata",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading courses...",
    invoked: "Courses loaded",
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

function statusColor(
  status: string,
  theme: "light" | "dark"
): { bg: string; text: string } {
  const dark = theme === "dark";
  switch (status.toLowerCase()) {
    case "published":
      return {
        bg: dark ? "#14532d" : "#dcfce7",
        text: dark ? "#86efac" : "#166534",
      };
    case "draft":
      return {
        bg: dark ? "#3f3f46" : "#f4f4f5",
        text: dark ? "#a1a1aa" : "#52525b",
      };
    case "archived":
      return {
        bg: dark ? "#1e1b4b" : "#ede9fe",
        text: dark ? "#a5b4fc" : "#4338ca",
      };
    default:
      return {
        bg: dark ? "#422006" : "#fef3c7",
        text: dark ? "#fcd34d" : "#92400e",
      };
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CourseDashboard() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const [activeFilter, setActiveFilter] = useState<string>("all");

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
    hover: dark ? "#27272a" : "#f9fafb",
    tagBg: dark ? "#27272a" : "#f3f4f6",
    tagText: dark ? "#d4d4d8" : "#374151",
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
          <p style={{ margin: 0, fontSize: 14 }}>Loading courses…</p>
        </div>
      </McpUseProvider>
    );
  }

  const allStatuses = ["all", ...Array.from(new Set(props.courses.map((c) => c.status)))];
  const filtered =
    activeFilter === "all"
      ? props.courses
      : props.courses.filter((c) => c.status === activeFilter);

  const labelForFilter =
    activeFilter === "all" ? "All" : activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1);

  return (
    <McpUseProvider autoSize>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: colors.bg,
          padding: 24,
          minHeight: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: colors.text,
                letterSpacing: "-0.01em",
              }}
            >
              {labelForFilter} Courses
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 13,
                color: colors.textSecondary,
              }}
            >
              {props.total} course{props.total !== 1 ? "s" : ""} total
            </p>
          </div>

          {/* Status filter tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {allStatuses.map((s) => {
              const active = s === activeFilter;
              return (
                <button
                  key={s}
                  onClick={() => setActiveFilter(s)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 20,
                    border: active
                      ? `1px solid ${colors.accent}`
                      : `1px solid ${colors.border}`,
                    backgroundColor: active ? colors.accentBg : "transparent",
                    color: active ? colors.accent : colors.textSecondary,
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: colors.textMuted,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📚</div>
            <p style={{ margin: 0, fontSize: 14 }}>No courses match this filter</p>
          </div>
        )}

        {/* Card grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((course) => {
            const pill = statusColor(course.status, theme);
            const tags = normalizeTags(course.tags);
            return (
              <div
                key={course.id}
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "box-shadow 0.15s",
                }}
              >
                {/* Title + status */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 600,
                      color: colors.text,
                      lineHeight: 1.3,
                      flex: 1,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {course.title}
                  </h3>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 11,
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

                {/* Description */}
                {course.description && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: colors.textSecondary,
                      lineHeight: 1.5,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {course.description}
                  </p>
                )}

                {/* Tags */}
                {tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: "2px 7px",
                          borderRadius: 6,
                          fontSize: 11,
                          backgroundColor: colors.tagBg,
                          color: colors.tagText,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                    {tags.length > 4 && (
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: 6,
                          fontSize: 11,
                          backgroundColor: colors.tagBg,
                          color: colors.textMuted,
                        }}
                      >
                        +{tags.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    paddingTop: 8,
                    borderTop: `1px solid ${colors.border}`,
                    marginTop: "auto",
                  }}
                >
                  <span style={{ fontSize: 12, color: colors.textMuted }}>
                    📖 {course.lesson_count} lesson{course.lesson_count !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>
                    👥 {course.enrollment_count} enrolled
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </McpUseProvider>
  );
}
