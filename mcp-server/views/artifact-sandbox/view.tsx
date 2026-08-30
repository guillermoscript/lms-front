import { useState } from "react";
import { useDynamicTool, useToolContext, useViewTheme } from "mcp-use/react";
import { Brand } from "../shared/branding";
import { useFormat, useStrings } from "../shared/i18n";
import { withWidgetBoundary } from "../shared/error-boundary";
import { type Props } from "./schema";
import "virtual:mcp-use/tailwind.css";

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

// ── Strings ──────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: "Rendering artifact…",
    difficulty: { easy: "Easy", medium: "Medium", hard: "Hard" } as Record<string, string>,
    passAt: (score: string) => `🎯 Pass ≥ ${score}`,
    tabPreview: "Preview",
    tabHtml: "HTML",
    tabEvaluation: "Evaluation",
    previewTitle: "Artifact preview",
    noHtml: "No HTML content to preview.",
    saving: "Saving…",
    saveChanges: "Save changes",
    savedButton: "Saved",
    revert: "Revert",
    savedNotice: "✓ Saved",
    saveFailed: "Save failed",
    serverOnly: "🔒 Server-side only — students never receive this.",
    criteriaHeading: "Evaluation criteria",
    criteriaNone: "(none set)",
    promptHeading: "Evaluator system prompt",
  },
  es: {
    loading: "Renderizando el artefacto…",
    difficulty: { easy: "Fácil", medium: "Media", hard: "Difícil" } as Record<string, string>,
    passAt: (score: string) => `🎯 Aprobado ≥ ${score}`,
    tabPreview: "Vista previa",
    tabHtml: "HTML",
    tabEvaluation: "Evaluación",
    previewTitle: "Vista previa del artefacto",
    noHtml: "No hay HTML que previsualizar.",
    saving: "Guardando…",
    saveChanges: "Guardar cambios",
    savedButton: "Guardado",
    revert: "Descartar",
    savedNotice: "✓ Guardado",
    saveFailed: "Error al guardar",
    serverOnly: "🔒 Solo en el servidor: los estudiantes nunca ven esto.",
    criteriaHeading: "Criterios de evaluación",
    criteriaNone: "(sin definir)",
    promptHeading: "Prompt de sistema del evaluador",
  },
};

function ArtifactSandbox() {
  const view = useToolContext();
  const dark = useViewTheme() === "dark";
  const t = useStrings(STRINGS);
  const fmt = useFormat();

  const [tab, setTab] = useState<Tab>("preview");
  // Local editable copy of the HTML; seeded once props arrive.
  const [html, setHtml] = useState<string | null>(null);

  const saveArtifact = useDynamicTool<
    { exercise_id: number; artifact_html: string },
    Record<string, unknown>
  >("lms_update_artifact_exercise");
  // useDynamicTool's handle has no isSuccess/isError — tracked locally instead,
  // reset at the start of every save so a new attempt clears the last outcome.
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // "pending" and "error" both render the loading branch, exactly like v1:
  // an isError result carries no structuredContent, and the transcript already
  // shows the tool's own error text.
  if (view.status !== "ready") {
    return (
      <>
        <Brand />
        <div className={dark ? "dark" : ""}>
          <div className="bg-zinc-50 p-10 text-center font-sans text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
            <div className="mx-auto mb-3 size-9 animate-spin rounded-full border-[3px] border-zinc-200 border-t-[var(--brand-600)] dark:border-zinc-800 dark:border-t-[var(--brand-400)]" />
            <p className="m-0 text-sm">{t.loading}</p>
          </div>
        </div>
      </>
    );
  }

  const { exercise, artifact } = view.toolOutput as Props;
  const currentHtml = html ?? artifact.html;
  const dirty = currentHtml !== artifact.html;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await saveArtifact.callTool({
        exercise_id: exercise.id,
        artifact_html: currentHtml,
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const tabButton = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`cursor-pointer rounded-lg border-none px-3.5 py-1.5 text-[13px] transition-all duration-150 ${
        tab === id
          ? "bg-[var(--brand-50)] font-semibold text-[var(--brand-600)] dark:bg-[var(--brand-950)] dark:text-[var(--brand-400)]"
          : "bg-transparent font-medium text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <Brand />
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
              {t.difficulty[exercise.difficulty.toLowerCase()] ?? exercise.difficulty}
            </span>
          </div>

          <div className="mb-3.5 flex flex-wrap gap-3.5">
            <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
              {artifact.type.replace("_", " ")}
            </span>
            <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
              {t.passAt(fmt.percent(artifact.passing_score))}
            </span>
          </div>

          {exercise.instructions && (
            <p className="mt-0 mb-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {exercise.instructions}
            </p>
          )}

          {/* Tabs */}
          <div className="mb-3 flex w-fit gap-1 rounded-[10px] bg-zinc-100 p-1 dark:bg-zinc-900">
            {tabButton("preview", t.tabPreview)}
            {tabButton("html", `${t.tabHtml}${dirty ? " •" : ""}`)}
            {tabButton("evaluation", t.tabEvaluation)}
          </div>

          {/* Preview */}
          {tab === "preview" && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800">
              {currentHtml ? (
                // sandbox WITHOUT allow-same-origin: the artifact can run scripts
                // but cannot reach the parent — exactly how students run it.
                <iframe
                  title={t.previewTitle}
                  srcDoc={currentHtml}
                  sandbox="allow-scripts allow-forms"
                  className="block h-[460px] w-full border-none"
                />
              ) : (
                <div className="p-10 text-center text-[13px] text-zinc-400 dark:text-zinc-500">
                  {t.noHtml}
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
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className={`rounded-lg border-none px-[18px] py-2 text-[13px] font-semibold transition-all duration-150 ${
                    dirty
                      ? "cursor-pointer bg-[var(--brand-600)] text-white dark:bg-[var(--brand-400)] dark:text-zinc-950"
                      : "cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                  } ${saving ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  {saving ? t.saving : dirty ? t.saveChanges : t.savedButton}
                </button>
                {dirty && (
                  <button
                    type="button"
                    onClick={() => setHtml(null)}
                    disabled={saving}
                    className="cursor-pointer rounded-lg border border-zinc-200 bg-transparent px-3.5 py-2 text-[13px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
                  >
                    {t.revert}
                  </button>
                )}
                {saved && !dirty && (
                  <span className="text-[13px] text-green-600 dark:text-green-400">
                    {t.savedNotice}
                  </span>
                )}
                {saveError && (
                  <span className="text-[13px] text-red-600 dark:text-red-400">
                    {saveError}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Evaluation (server-side answer key) */}
          {tab === "evaluation" && (
            <div>
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-600 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                {t.serverOnly}
              </div>

              <h4 className="mt-0 mb-1.5 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {t.criteriaHeading}
              </h4>
              <pre className="mt-0 mb-4 rounded-[10px] border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                {artifact.evaluation_criteria || t.criteriaNone}
              </pre>

              {artifact.system_prompt && (
                <>
                  <h4 className="mt-0 mb-1.5 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.promptHeading}
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
    </>
  );
}

export default withWidgetBoundary(ArtifactSandbox);
