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

const exerciseSchema = z.object({
  id: z.number(),
  title: z.string(),
  instructions: z.string(),
  difficulty: z.string(),
});

const artifactSchema = z.object({
  type: z.string(),
  html: z.string(),
  evaluation_criteria: z.string(),
  system_prompt: z.string().nullable(),
  passing_score: z.number(),
});

const propsSchema = z.object({
  exercise: exerciseSchema,
  artifact: artifactSchema,
});

export const widgetMetadata: WidgetMetadata = {
  description:
    "Preview an artifact exercise's interactive HTML in a sandboxed iframe, edit the HTML, and save changes back. Also shows the server-side evaluation criteria (author answer key).",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    invoking: "Rendering artifact…",
    invoked: "Artifact preview ready",
  },
};

type Props = z.infer<typeof propsSchema>;

type Tab = "preview" | "html" | "evaluation";

// ── Helpers ──────────────────────────────────────────────────────────────────

function difficultyPill(
  level: string,
  theme: "light" | "dark"
): { bg: string; text: string } {
  const dark = theme === "dark";
  switch (level.toLowerCase()) {
    case "easy":
      return { bg: dark ? "#14532d" : "#dcfce7", text: dark ? "#86efac" : "#166534" };
    case "hard":
      return { bg: dark ? "#7f1d1d" : "#fee2e2", text: dark ? "#fca5a5" : "#991b1b" };
    default: // medium
      return { bg: dark ? "#422006" : "#fef3c7", text: dark ? "#fcd34d" : "#92400e" };
  }
}

function artifactEmoji(type: string): string {
  switch (type) {
    case "code_editor":
      return "💻";
    case "spreadsheet":
      return "📊";
    case "essay":
      return "📝";
    case "simulation":
      return "🔬";
    default:
      return "🧩";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ArtifactSandbox() {
  const { props, isPending } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  const [tab, setTab] = useState<Tab>("preview");
  // Local editable copy of the HTML; seeded once props arrive.
  const [html, setHtml] = useState<string | null>(null);

  const {
    callTool: saveArtifact,
    isPending: saving,
    isSuccess: saved,
    isError: saveFailed,
    error: saveError,
  } = useCallTool<{ exercise_id: number; artifact_html: string }>(
    "lms_update_artifact_exercise"
  );

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
    codeBg: dark ? "#0a0a0a" : "#f6f8fa",
    warnBg: dark ? "#3f2d0a" : "#fffbeb",
    warnBorder: dark ? "#854d0e" : "#fde68a",
    warnText: dark ? "#fcd34d" : "#92400e",
    okBg: dark ? "#14532d" : "#dcfce7",
    okText: dark ? "#86efac" : "#166534",
    errBg: dark ? "#7f1d1d" : "#fee2e2",
    errText: dark ? "#fca5a5" : "#991b1b",
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
          <p style={{ margin: 0, fontSize: 14 }}>Rendering artifact…</p>
        </div>
      </McpUseProvider>
    );
  }

  const { exercise, artifact } = props;
  const currentHtml = html ?? artifact.html;
  const dirty = currentHtml !== artifact.html;
  const pill = difficultyPill(exercise.difficulty, theme);

  const handleSave = () => {
    saveArtifact({ exercise_id: exercise.id, artifact_html: currentHtml });
  };

  const tabButton = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        border: "none",
        backgroundColor: tab === id ? colors.accentBg : "transparent",
        color: tab === id ? colors.accent : colors.textSecondary,
        fontSize: 13,
        fontWeight: tab === id ? 600 : 500,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 6,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 700,
              color: colors.text,
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
            }}
          >
            {artifactEmoji(artifact.type)} {exercise.title}
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
            {exercise.difficulty}
          </span>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: colors.textMuted }}>
            {artifact.type.replace("_", " ")}
          </span>
          <span style={{ fontSize: 13, color: colors.textMuted }}>
            🎯 Pass ≥ {artifact.passing_score}%
          </span>
        </div>

        {exercise.instructions && (
          <p
            style={{
              margin: "0 0 16px",
              fontSize: 14,
              color: colors.textSecondary,
              lineHeight: 1.6,
            }}
          >
            {exercise.instructions}
          </p>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 12,
            padding: 4,
            borderRadius: 10,
            backgroundColor: colors.sectionBg,
            width: "fit-content",
          }}
        >
          {tabButton("preview", "Preview")}
          {tabButton("html", `HTML${dirty ? " •" : ""}`)}
          {tabButton("evaluation", "Evaluation")}
        </div>

        {/* Preview */}
        {tab === "preview" && (
          <div
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "#ffffff",
            }}
          >
            {currentHtml ? (
              // sandbox WITHOUT allow-same-origin: the artifact can run scripts
              // but cannot reach the parent — exactly how students run it.
              <iframe
                title="Artifact preview"
                srcDoc={currentHtml}
                sandbox="allow-scripts allow-forms"
                style={{ width: "100%", height: 460, border: "none", display: "block" }}
              />
            ) : (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  fontSize: 13,
                  color: colors.textMuted,
                }}
              >
                No HTML content to preview.
              </div>
            )}
          </div>
        )}

        {/* HTML editor */}
        {tab === "html" && (
          <div>
            <textarea
              value={currentHtml}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%",
                height: 360,
                boxSizing: "border-box",
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.codeBg,
                color: colors.text,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12.5,
                lineHeight: 1.5,
                resize: "vertical",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 10,
              }}
            >
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: dirty ? colors.accent : colors.border,
                  color: dirty ? "#ffffff" : colors.textMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: saving || !dirty ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  transition: "all 0.15s",
                }}
              >
                {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </button>
              {dirty && (
                <button
                  onClick={() => setHtml(null)}
                  disabled={saving}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: "transparent",
                    color: colors.textSecondary,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Revert
                </button>
              )}
              {saved && !dirty && (
                <span style={{ fontSize: 13, color: colors.okText }}>✓ Saved</span>
              )}
              {saveFailed && (
                <span style={{ fontSize: 13, color: colors.errText }}>
                  {saveError instanceof Error ? saveError.message : "Save failed"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Evaluation (server-side answer key) */}
        {tab === "evaluation" && (
          <div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                backgroundColor: colors.warnBg,
                border: `1px solid ${colors.warnBorder}`,
                color: colors.warnText,
                fontSize: 12.5,
                fontWeight: 500,
                marginBottom: 12,
              }}
            >
              🔒 Server-side only — students never receive this.
            </div>

            <h4
              style={{
                margin: "0 0 6px",
                fontSize: 13,
                fontWeight: 600,
                color: colors.text,
              }}
            >
              Evaluation criteria
            </h4>
            <pre
              style={{
                margin: "0 0 16px",
                padding: 12,
                borderRadius: 10,
                backgroundColor: colors.codeBg,
                border: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {artifact.evaluation_criteria || "(none set)"}
            </pre>

            {artifact.system_prompt && (
              <>
                <h4
                  style={{
                    margin: "0 0 6px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.text,
                  }}
                >
                  Evaluator system prompt
                </h4>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: colors.codeBg,
                    border: `1px solid ${colors.border}`,
                    color: colors.textSecondary,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {artifact.system_prompt}
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
