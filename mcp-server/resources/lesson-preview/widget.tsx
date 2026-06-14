import {
  McpUseProvider,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────────────

const lessonSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  video_url: z.string().nullable(),
  content: z.string().nullable(),
  status: z.string(),
  sequence: z.number(),
});

const resourceSchema = z.object({
  id: z.number(),
  file_name: z.string(),
  file_size: z.number().nullable(),
  mime_type: z.string().nullable(),
});

const propsSchema = z.object({
  lesson: lessonSchema,
  resources: z.array(resourceSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display a lesson reading view with content, optional video, and attached resources",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Loading lesson…",
    invoked: "Lesson loaded",
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
    default:
      return { bg: dark ? "#422006" : "#fef3c7", text: dark ? "#fcd34d" : "#92400e" };
  }
}

function humanFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function fileIcon(mimeType: string | null): string {
  if (!mimeType) return "📎";
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📄";
  if (
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip")
  )
    return "🗜";
  if (
    mimeType.includes("word") ||
    mimeType.includes("document")
  )
    return "📝";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📑";
  if (mimeType.includes("text")) return "📃";
  return "📎";
}

function humanMime(mimeType: string | null): string {
  if (!mimeType) return "File";
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/gif": "GIF",
    "image/webp": "WebP",
    "video/mp4": "MP4",
    "audio/mpeg": "MP3",
    "text/plain": "Text",
    "text/html": "HTML",
    "application/zip": "ZIP",
    "application/json": "JSON",
    "application/msword": "Word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  };
  if (map[mimeType]) return map[mimeType];
  const parts = mimeType.split("/");
  return parts[parts.length - 1].toUpperCase().slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LessonPreview() {
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
    codeBg: dark ? "#141414" : "#f8f7ff",
    codeBorder: dark ? "#2a2a2a" : "#ede9fe",
    contentText: dark ? "#d4d4d8" : "#1f2937",
    videoBg: dark ? "#18181b" : "#f0f9ff",
    videoBorder: dark ? "#1e3a5f" : "#bae6fd",
    videoText: dark ? "#38bdf8" : "#0369a1",
    resBg: dark ? "#141414" : "#fafafa",
    resHover: dark ? "#222" : "#f3f4f6",
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
          <p style={{ margin: 0, fontSize: 14 }}>Loading lesson…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { lesson, resources } = props;
  const pill = statusPill(lesson.status, theme);

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
        {/* Lesson header */}
        <div style={{ marginBottom: 20 }}>
          {/* Breadcrumb-ish sequence + status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                backgroundColor: colors.accentBg,
                color: colors.accent,
              }}
            >
              Lesson {lesson.sequence}
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                backgroundColor: pill.bg,
                color: pill.text,
              }}
            >
              {lesson.status}
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: colors.text,
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
            }}
          >
            {lesson.title}
          </h1>

          {lesson.description && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 15,
                color: colors.textSecondary,
                lineHeight: 1.6,
              }}
            >
              {lesson.description}
            </p>
          )}
        </div>

        {/* Video link */}
        {lesson.video_url && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 10,
              backgroundColor: colors.videoBg,
              border: `1px solid ${colors.videoBorder}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 20 }}>▶️</span>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 2,
                }}
              >
                Video lesson
              </div>
              <a
                href={lesson.video_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13,
                  color: colors.videoText,
                  fontWeight: 500,
                  textDecoration: "none",
                  wordBreak: "break-all",
                }}
              >
                {lesson.video_url}
              </a>
            </div>
          </div>
        )}

        {/* Content reading pane */}
        {lesson.content ? (
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 12,
              }}
            >
              Content (preview)
            </div>
            <pre
              style={{
                margin: 0,
                padding: 16,
                borderRadius: 8,
                backgroundColor: colors.codeBg,
                border: `1px solid ${colors.codeBorder}`,
                fontSize: 13.5,
                lineHeight: 1.7,
                color: colors.contentText,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily:
                  '"Noto Sans", "Georgia", ui-serif, serif',
                overflowX: "auto",
              }}
            >
              {lesson.content}
            </pre>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 32,
              textAlign: "center",
              color: colors.textMuted,
              marginBottom: 20,
              fontSize: 13,
            }}
          >
            No written content for this lesson.
          </div>
        )}

        {/* Attached resources */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${colors.border}`,
              backgroundColor: colors.resBg,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: colors.text,
              }}
            >
              Attached resources ({resources.length})
            </span>
          </div>

          {resources.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: colors.textMuted,
                fontSize: 13,
              }}
            >
              No files attached to this lesson.
            </div>
          ) : (
            <div>
              {resources.map((res, idx) => (
                <div
                  key={res.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 16px",
                    borderBottom:
                      idx === resources.length - 1
                        ? "none"
                        : `1px solid ${colors.border}`,
                    transition: "background-color 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor =
                      colors.resHover;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor =
                      "transparent";
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0 }}>
                    {fileIcon(res.mime_type)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: colors.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {res.file_name}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                      {humanMime(res.mime_type)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: colors.textMuted,
                      flexShrink: 0,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {humanFileSize(res.file_size)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
