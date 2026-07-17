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

function difficultyPill(level: string): string {
  switch (level.toLowerCase()) {
    case "easy":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case "hard":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    default: // medium
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
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

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-violet-600 dark:border-zinc-800 dark:border-t-violet-400" />
            <p className="m-0 text-sm">Rendering artifact…</p>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { exercise, artifact } = props;
  const currentHtml = html ?? artifact.html;
  const dirty = currentHtml !== artifact.html;

  const handleSave = () => {
    saveArtifact({ exercise_id: exercise.id, artifact_html: currentHtml });
  };

  const tabButton = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`cursor-pointer rounded-lg border-none px-3.5 py-1.5 text-[13px] transition-all duration-150 ${
        tab === id
          ? "bg-violet-50 font-semibold text-violet-600 dark:bg-violet-950 dark:text-violet-400"
          : "bg-transparent font-medium text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {label}
    </button>
  );

  return (
    <McpUseProvider autoSize>
      <div className={dark ? "dark" : ""}>
        <div className="bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
          {/* Header */}
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <h2 className="m-0 text-[19px] leading-[1.3] font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {artifactEmoji(artifact.type)} {exercise.title}
            </h2>
            <span
              className={`shrink-0 rounded-[10px] px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap ${difficultyPill(exercise.difficulty)}`}
            >
              {exercise.difficulty}
            </span>
          </div>

          <div className="mb-3.5 flex flex-wrap gap-3.5">
            <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
              {artifact.type.replace("_", " ")}
            </span>
            <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
              🎯 Pass ≥ {artifact.passing_score}%
            </span>
          </div>

          {exercise.instructions && (
            <p className="mt-0 mb-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {exercise.instructions}
            </p>
          )}

          {/* Tabs */}
          <div className="mb-3 flex w-fit gap-1 rounded-[10px] bg-zinc-100 p-1 dark:bg-zinc-900">
            {tabButton("preview", "Preview")}
            {tabButton("html", `HTML${dirty ? " •" : ""}`)}
            {tabButton("evaluation", "Evaluation")}
          </div>

          {/* Preview */}
          {tab === "preview" && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800">
              {currentHtml ? (
                // sandbox WITHOUT allow-same-origin: the artifact can run scripts
                // but cannot reach the parent — exactly how students run it.
                <iframe
                  title="Artifact preview"
                  srcDoc={currentHtml}
                  sandbox="allow-scripts allow-forms"
                  className="block h-[460px] w-full border-none"
                />
              ) : (
                <div className="p-10 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
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
                className="box-border h-[360px] w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12.5px] leading-normal text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <div className="mt-2.5 flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className={`rounded-lg border-none px-[18px] py-2 text-[13px] font-semibold transition-all duration-150 ${
                    dirty
                      ? "cursor-pointer bg-violet-600 text-white dark:bg-violet-400 dark:text-zinc-950"
                      : "cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                  } ${saving ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </button>
                {dirty && (
                  <button
                    onClick={() => setHtml(null)}
                    disabled={saving}
                    className="cursor-pointer rounded-lg border border-zinc-200 bg-transparent px-3.5 py-2 text-[13px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
                  >
                    Revert
                  </button>
                )}
                {saved && !dirty && (
                  <span className="text-[13px] text-green-600 dark:text-green-400">
                    ✓ Saved
                  </span>
                )}
                {saveFailed && (
                  <span className="text-[13px] text-red-600 dark:text-red-400">
                    {saveError instanceof Error ? saveError.message : "Save failed"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Evaluation (server-side answer key) */}
          {tab === "evaluation" && (
            <div>
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-600 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                🔒 Server-side only — students never receive this.
              </div>

              <h4 className="mt-0 mb-1.5 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                Evaluation criteria
              </h4>
              <pre className="mt-0 mb-4 rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                {artifact.evaluation_criteria || "(none set)"}
              </pre>

              {artifact.system_prompt && (
                <>
                  <h4 className="mt-0 mb-1.5 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                    Evaluator system prompt
                  </h4>
                  <pre className="m-0 rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    {artifact.system_prompt}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
