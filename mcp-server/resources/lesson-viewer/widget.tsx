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

const lessonSchema = z.object({
  id: z.number(),
  course_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  summary: z.string().nullable(),
  content: z.string().nullable(),
  video_url: z.string().nullable(),
  embed_code: z.string().nullable(),
  sequence: z.number(),
});

const propsSchema = z.object({
  lesson: lessonSchema,
  course_title: z.string(),
  completed: z.boolean(),
  locked: z.boolean(),
  locked_by: z.object({ id: z.number(), title: z.string() }).nullable(),
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Student lesson reading view with content, video link, and a mark-complete action",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Opening lesson…",
    invoked: "Lesson ready",
  },
};

type Props = z.infer<typeof propsSchema>;

// ── Component ────────────────────────────────────────────────────────────────

export default function LessonViewer() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const {
    callTool: completeLesson,
    isPending: isCompleting,
    isError,
    error,
  } = useCallTool("lms_complete_lesson");
  // Optimistic local flag so the button flips immediately on success.
  const [justCompleted, setJustCompleted] = useState(false);

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
    done: dark ? "#4ade80" : "#16a34a",
    doneBg: dark ? "#14532d" : "#dcfce7",
    lockBg: dark ? "#422006" : "#fef3c7",
    lockText: dark ? "#fcd34d" : "#92400e",
    errBg: dark ? "#450a0a" : "#fef2f2",
    errText: dark ? "#fca5a5" : "#b91c1c",
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
          <p style={{ margin: 0, fontSize: 14 }}>Opening lesson…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { lesson, course_title, locked, locked_by } = props;
  const completed = props.completed || justCompleted;

  const handleComplete = () => {
    completeLesson(
      { lesson_id: lesson.id },
      { onSuccess: () => setJustCompleted(true) }
    );
  };

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
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              flexWrap: "wrap",
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
            <span style={{ fontSize: 12, color: colors.textMuted }}>
              {course_title}
            </span>
            {completed && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  backgroundColor: colors.doneBg,
                  color: colors.done,
                }}
              >
                ✓ Completed
              </span>
            )}
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

        {locked ? (
          <div
            style={{
              backgroundColor: colors.lockBg,
              borderRadius: 12,
              padding: 28,
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
            <p
              style={{
                margin: 0,
                fontWeight: 650,
                fontSize: 14,
                color: colors.lockText,
              }}
            >
              This lesson is locked
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.lockText }}>
              Complete{locked_by ? ` "${locked_by.title}"` : " the previous lesson"}{" "}
              first — this course requires sequential completion.
            </p>
          </div>
        ) : (
          <>
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
                <div style={{ minWidth: 0 }}>
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

            {/* Content */}
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
                    fontFamily: '"Noto Sans", "Georgia", ui-serif, serif',
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
                No written content for this lesson
                {lesson.video_url ? " — watch the video above." : "."}
              </div>
            )}

            {/* Error from mark-complete */}
            {isError && (
              <div
                style={{
                  backgroundColor: colors.errBg,
                  color: colors.errText,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  marginBottom: 14,
                }}
              >
                {error instanceof Error
                  ? error.message
                  : "Could not mark the lesson complete."}
              </div>
            )}

            {/* Mark complete */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {completed ? (
                <span
                  style={{
                    padding: "9px 18px",
                    borderRadius: 10,
                    fontSize: 13.5,
                    fontWeight: 650,
                    backgroundColor: colors.doneBg,
                    color: colors.done,
                  }}
                >
                  ✓ Lesson completed
                </span>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 10,
                    fontSize: 13.5,
                    fontWeight: 650,
                    border: "none",
                    cursor: isCompleting ? "wait" : "pointer",
                    backgroundColor: colors.accent,
                    color: "#ffffff",
                    opacity: isCompleting ? 0.7 : 1,
                  }}
                >
                  {isCompleting ? "Marking…" : "Mark lesson complete"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </McpUseProvider>
  );
}
