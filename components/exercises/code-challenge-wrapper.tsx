"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    SandpackProvider,
    SandpackLayout,
    SandpackCodeEditor,
    SandpackPreview,
    SandpackFileExplorer,
    useSandpack
} from "@codesandbox/sandpack-react";
import { Button } from "@/components/ui/button";
import { IconPlayerPlay, IconCheck, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import ExerciseResultSummary from "@/components/exercises/exercise-result-summary";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";

interface CodeChallengeWrapperProps {
    exercise: { active_file?: string | null; visible_files?: string[] | null };
    files: Record<string, string>;
    exerciseId: number;
    isExerciseCompleted: boolean;
    userId: string;
    /** The student's newest row in exercise_code_student_submissions. */
    savedSubmission?: SavedSubmission | null;
}

interface SavedSubmission {
    id: number;
    submission_code: string;
    files: Json | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** How long the editor waits after the last keystroke before saving. */
const AUTOSAVE_DELAY_MS = 1500;

interface CodeEvaluation {
    score: number;
    passed: boolean;
    feedback: string;
    strengths: string[];
    improvements: string[];
    passingScore: number;
    attemptNumber: number | null;
}

/** Every file of the project, path-labelled, as the grader reads it. */
function serializeFiles(files: Record<string, { code: string }>): string {
    return Object.entries(files)
        .map(([path, file]) => `// ── ${path} ──\n${file.code}`)
        .join("\n\n");
}

/** The file both clients treat as "the" code: the native app edits only this one. */
function primaryPath(exercise: CodeChallengeWrapperProps["exercise"], files: Record<string, string>): string | null {
    return exercise.active_file || Object.keys(files)[0] || null;
}

function savedFiles(saved: SavedSubmission | null | undefined): Record<string, string> | null {
    const files = saved?.files;
    if (!files || typeof files !== "object" || Array.isArray(files)) return null;
    return Object.fromEntries(
        Object.entries(files).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
}

/**
 * Starter files with the student's saved code laid over them. Files the
 * teacher added after the student last saved still show up. A row from the
 * native app carries only `submission_code`, which is the primary file.
 */
function restoreFiles(
    starter: Record<string, string>,
    saved: SavedSubmission | null | undefined,
    primary: string | null
): Record<string, string> {
    if (!saved) return starter;
    const files = savedFiles(saved);
    if (files) return { ...starter, ...files };
    return primary ? { ...starter, [primary]: saved.submission_code } : starter;
}

/**
 * Saves the student's code as they type (#858), into one row per visit. Only
 * files the student changed or added are stored, so a later edit to an
 * untouched starter file still reaches them.
 */
function useCodeAutosave({
    exerciseId,
    userId,
    starter,
    primary,
    saved,
}: {
    exerciseId: number;
    userId: string;
    starter: Record<string, string>;
    primary: string | null;
    saved: SavedSubmission | null | undefined;
}) {
    const { sandpack } = useSandpack();
    const supabase = useMemo(() => createClient(), []);
    const [status, setStatus] = useState<SaveStatus>("idle");
    // Files Sandpack's template adds on its own (package.json, index.js…) are not the student's.
    const [templatePaths] = useState(() => {
        const known = new Set([...Object.keys(starter), ...Object.keys(savedFiles(saved) ?? {})]);
        return new Set(Object.keys(sandpack.files).filter((path) => !known.has(path)));
    });
    const snapshot = useCallback(
        (files: Record<string, { code: string }>) => {
            const changed: Record<string, string> = {};
            for (const [path, file] of Object.entries(files)) {
                if (templatePaths.has(path)) continue;
                if (file.code !== starter[path]) changed[path] = file.code;
            }
            const code = primary ? (files[primary]?.code ?? starter[primary] ?? "") : "";
            return { changed, code, key: JSON.stringify(changed) };
        },
        [templatePaths, starter, primary]
    );
    const [initialKey] = useState(() => snapshot(sandpack.files).key);

    const rowId = useRef<number | null>(saved?.id ?? null);
    const lastSavedKey = useRef(initialKey);
    const latestFiles = useRef(sandpack.files);
    // One save at a time, so a slow insert never races the next update.
    const queue = useRef<Promise<void>>(Promise.resolve());

    const save = useCallback(() => {
        queue.current = queue.current.then(async () => {
            const { changed, code, key } = snapshot(latestFiles.current);
            if (key === lastSavedKey.current) return;
            setStatus("saving");
            const row = { submission_code: code, files: changed };
            const { data, error } = rowId.current
                ? await supabase.from("exercise_code_student_submissions").update(row).eq("id", rowId.current).select("id").maybeSingle()
                : await supabase
                    .from("exercise_code_student_submissions")
                    .insert({ ...row, exercise_id: exerciseId, user_id: userId })
                    .select("id")
                    .single();
            if (error || !data) {
                setStatus("error");
                return;
            }
            rowId.current = data.id;
            lastSavedKey.current = key;
            setStatus("saved");
        });
        return queue.current;
    }, [snapshot, supabase, exerciseId, userId]);

    useEffect(() => {
        latestFiles.current = sandpack.files;
        const timer = setTimeout(save, AUTOSAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [sandpack.files, save]);

    // Leaving before the debounce fires would drop the last keystrokes.
    useEffect(() => {
        const flush = () => void save();
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            flush();
        };
    }, [save]);

    return { save, status };
}

const SaveStatusLabel = ({ status }: { status: SaveStatus }) => {
    const t = useTranslations("exercises.code");
    if (status === "idle") return null;
    return (
        <span
            className={status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            role="status"
            aria-live="polite"
        >
            {status === "saving" ? t("saving") : status === "saved" ? t("saved") : t("saveFailed")}
        </span>
    );
};

const SubmitButton = ({
    exerciseId,
    onEvaluated,
    beforeSubmit,
}: {
    exerciseId: number;
    onEvaluated: (evaluation: CodeEvaluation) => void;
    beforeSubmit: () => Promise<void>;
}) => {
    const { sandpack } = useSandpack();
    const [loading, setLoading] = useState(false);
    const t = useTranslations("exercises.code");

    // The platform grades the code (#843). The browser never writes a score.
    const handleSubmit = async () => {
        setLoading(true);
        try {
            // What gets graded is what comes back next visit.
            await beforeSubmit();
            const res = await fetch("/api/exercises/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ exerciseId, content: serializeFiles(sandpack.files) }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(res.status === 429 ? t("rateLimited") : t("evaluationFailed"));
                return;
            }
            onEvaluated(body as CodeEvaluation);
        } catch {
            toast.error(t("evaluationFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-success hover:bg-success/90 text-success-foreground gap-2"
        >
            {loading ? <IconLoader2 size={18} className="animate-spin" aria-hidden="true" /> : <IconPlayerPlay size={18} aria-hidden="true" />}
            {loading ? t("checking") : t("submit")}
        </Button>
    );
}

function ChallengeWorkspace({
    exerciseId,
    userId,
    starter,
    primary,
    saved,
    onEvaluated,
}: {
    exerciseId: number;
    userId: string;
    starter: Record<string, string>;
    primary: string | null;
    saved: SavedSubmission | null | undefined;
    onEvaluated: (evaluation: CodeEvaluation) => void;
}) {
    const t = useTranslations("exercises.code");
    const { save, status } = useCodeAutosave({ exerciseId, userId, starter, primary, saved });

    return (
        <SandpackLayout className="overflow-hidden rounded-card ring-1 ring-foreground/10 lg:ring-0">
            <SandpackFileExplorer className="border-r bg-muted/50" />
            <SandpackCodeEditor
                showLineNumbers
                showTabs
                closableTabs
            />
            <div className="sp-output-panel flex flex-col border-l bg-background">
                <div className="p-3 border-b flex items-center justify-between bg-muted/30 shrink-0">
                    <span className="text-sm font-semibold">{t("output")}</span>
                    <div className="flex items-center gap-2">
                        <SaveStatusLabel status={status} />
                        <SubmitButton exerciseId={exerciseId} onEvaluated={onEvaluated} beforeSubmit={save} />
                    </div>
                </div>
                <SandpackPreview
                    className="flex-1 min-h-0"
                    showNavigator={false}
                    showRefreshButton={true}
                />
            </div>
        </SandpackLayout>
    );
}

export default function CodeChallengeWrapper({
    exercise,
    files,
    exerciseId,
    isExerciseCompleted: initialCompleted,
    userId,
    savedSubmission,
}: CodeChallengeWrapperProps) {
    const [isCompleted, setIsCompleted] = useState(initialCompleted);
    const [evaluation, setEvaluation] = useState<CodeEvaluation | null>(null);
    const tGamification = useTranslations("components.gamification");
    const t = useTranslations("exercises.code");
    const primary = primaryPath(exercise, files);
    // Restored once: the editor owns the files from here on.
    const [initialFiles] = useState(() => restoreFiles(files, savedSubmission, primary));

    const handleEvaluated = (result: CodeEvaluation) => {
        setEvaluation(result);
        if (result.passed && !isCompleted) {
            setIsCompleted(true);
            toast.success(tGamification("xpAwarded.exercise_completion"));
        }
    }

    return (
        <>
            <style>{`
                .sp-challenge-wrapper .sp-layout {
                    --sp-layout-height: clamp(400px, calc(100svh - 280px), 720px);
                    width: 100%;
                }
                .sp-challenge-wrapper .sp-output-panel {
                    height: clamp(400px, calc(100svh - 280px), 720px);
                    min-height: 400px;
                }
                @media (max-width: 639px) {
                    .sp-challenge-wrapper .sp-layout {
                        --sp-layout-height: 350px;
                        flex-direction: column !important;
                        height: 610px !important;
                    }
                    .sp-challenge-wrapper .sp-file-explorer {
                        display: none !important;
                    }
                    .sp-challenge-wrapper .sp-editor {
                        flex: 0 0 350px !important;
                        height: 350px !important;
                        width: 100% !important;
                    }
                    .sp-challenge-wrapper .sp-output-panel {
                        flex: 0 0 250px !important;
                        height: 250px !important;
                        min-height: 0 !important;
                        width: 100% !important;
                        border-top: 1px solid var(--border);
                        border-left: none !important;
                    }
                }
                /* Desktop work pane: code over its output, filling the pane. The
                   file tree gives way to the editor's own tabs. */
                @media (min-width: 1024px) {
                    .sp-challenge-wrapper .sp-wrapper {
                        flex: 1 1 0;
                        min-height: 0;
                    }
                    .sp-challenge-wrapper .sp-layout {
                        --sp-layout-height: 100%;
                        flex-direction: column !important;
                        flex-wrap: nowrap !important;
                        height: 100% !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                    }
                    .sp-challenge-wrapper .sp-file-explorer {
                        display: none !important;
                    }
                    .sp-challenge-wrapper .sp-editor {
                        flex: 3 1 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        min-height: 0 !important;
                    }
                    .sp-challenge-wrapper .sp-output-panel {
                        flex: 2 1 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        min-height: 0 !important;
                        border-left: none !important;
                        border-top: 1px solid var(--border);
                    }
                }
            `}</style>

            <div className="sp-challenge-wrapper space-y-4 lg:flex lg:h-full lg:flex-col lg:space-y-0">
                <SandpackProvider
                    files={initialFiles}
                    theme="dark"
                    template="react"
                    options={{
                        activeFile: exercise.active_file || undefined,
                        visibleFiles: exercise.visible_files || undefined,
                    }}
                >
                    <ChallengeWorkspace
                        exerciseId={exerciseId}
                        userId={userId}
                        starter={files}
                        primary={primary}
                        saved={savedSubmission}
                        onEvaluated={handleEvaluated}
                    />
                </SandpackProvider>

                {evaluation && (
                    <ExerciseResultSummary
                        className="lg:shrink-0 lg:max-h-[40%] lg:overflow-y-auto lg:border-t lg:p-4"
                        score={evaluation.score}
                        passed={evaluation.passed}
                        feedback={evaluation.feedback}
                        strengths={evaluation.strengths}
                        improvements={evaluation.improvements}
                        attemptNumber={evaluation.attemptNumber}
                        passingScore={evaluation.passingScore}
                    />
                )}

                {isCompleted && !evaluation && (
                    // A status line. It used to be a tinted card with an icon
                    // medallion and a "Next Activity" button wired to nothing.
                    <p className="flex items-center gap-2 text-sm font-medium text-success lg:shrink-0 lg:border-t lg:px-4 lg:py-3" role="status">
                        <IconCheck size={16} aria-hidden="true" />
                        {t("solved")}
                    </p>
                )}
            </div>
        </>
    );
}
