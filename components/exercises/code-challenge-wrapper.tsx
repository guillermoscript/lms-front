"use client";

import { useState } from "react";
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

interface CodeChallengeWrapperProps {
    exercise: { active_file?: string | null; visible_files?: string[] | null };
    files: Record<string, string>;
    exerciseId: number;
    isExerciseCompleted: boolean;
    userCode?: string;
}

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

const SubmitButton = ({ exerciseId, onEvaluated }: { exerciseId: number; onEvaluated: (evaluation: CodeEvaluation) => void }) => {
    const { sandpack } = useSandpack();
    const [loading, setLoading] = useState(false);
    const t = useTranslations("exercises.code");

    // The platform grades the code (#843). The browser never writes a score.
    const handleSubmit = async () => {
        setLoading(true);
        try {
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

export default function CodeChallengeWrapper({
    exercise,
    files,
    exerciseId,
    isExerciseCompleted: initialCompleted,
}: CodeChallengeWrapperProps) {
    const [isCompleted, setIsCompleted] = useState(initialCompleted);
    const [evaluation, setEvaluation] = useState<CodeEvaluation | null>(null);
    const tGamification = useTranslations("components.gamification");
    const t = useTranslations("exercises.code");

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
                    files={files}
                    theme="dark"
                    template="react"
                    options={{
                        activeFile: exercise.active_file || undefined,
                        visibleFiles: exercise.visible_files || undefined,
                    }}
                >
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
                                    <SubmitButton exerciseId={exerciseId} onEvaluated={handleEvaluated} />
                                </div>
                            </div>
                            <SandpackPreview
                                className="flex-1 min-h-0"
                                showNavigator={false}
                                showRefreshButton={true}
                            />
                        </div>
                    </SandpackLayout>
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
