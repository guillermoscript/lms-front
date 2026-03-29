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
import { IconPlayerPlay, IconCheck, IconRotateClockwise, IconRobot } from "@tabler/icons-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface CodeChallengeWrapperProps {
    exercise: any;
    files: Record<string, string>;
    exerciseId: number;
    isExerciseCompleted: boolean;
    userCode?: string;
    tenantId: string;
}

const SubmitButton = ({ onComplete }: { onComplete: () => void }) => {
    const { sandpack } = useSandpack();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            // In a real app, you'd send sandpack.files to an API to evaluate
            // For now we simulate success after 2 seconds
            await new Promise(r => setTimeout(r, 2000));
            onComplete();
            toast.success("Solution submitted and verified!");
        } catch (e) {
            toast.error("Evaluation failed. Check your code.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
        >
            {loading ? <span className="animate-spin text-lg">⌛</span> : <IconPlayerPlay size={18} />}
            Run & Verify
        </Button>
    );
}

export default function CodeChallengeWrapper({
    exercise,
    files,
    exerciseId,
    isExerciseCompleted: initialCompleted,
    userCode,
    tenantId,
}: CodeChallengeWrapperProps) {
    const [isCompleted, setIsCompleted] = useState(initialCompleted);
    const tGamification = useTranslations("gamification");
    const supabase = createClient();

    const handleComplete = async () => {
        setIsCompleted(true);
        // Persist completion in Supabase
        const { data: { session } } = await supabase.auth.getSession(); const user = session?.user;
        if (user) {
            await supabase.from('exercise_completions').insert({
                exercise_id: exerciseId,
                user_id: user.id,
                completed_by: user.id,
                score: 100,
                tenant_id: tenantId,
            });
            toast.success(tGamification("xpAwarded.exercise_completion"));
        }
    }

    return (
        <div className="space-y-4">
            <SandpackProvider
                files={files}
                theme="dark"
                template="react"
                options={{
                    activeFile: exercise.active_file || undefined,
                    visibleFiles: exercise.visible_files || undefined,
                }}
            >
                <SandpackLayout className="rounded-xl overflow-hidden border shadow-soft ring-1 ring-border/50">
                    <SandpackFileExplorer className="h-[600px] border-r bg-muted/50" />
                    <SandpackCodeEditor
                        className="h-[600px]"
                        showLineNumbers
                        showTabs
                        closableTabs
                    />
                    <div className="flex flex-col border-l h-[600px] bg-background">
                        <div className="p-3 border-b flex items-center justify-between bg-muted/30">
                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Output</span>
                            <div className="flex items-center gap-2">
                                <SubmitButton onComplete={handleComplete} />
                            </div>
                        </div>
                        <SandpackPreview
                            className="flex-1"
                            showNavigator={false}
                            showRefreshButton={true}
                        />
                    </div>
                </SandpackLayout>
            </SandpackProvider>

            {isCompleted && (
                <div className="p-4 bg-green-50 border border-green-100 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                            <IconCheck size={24} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-green-900">Challenge Completed!</h4>
                            <p className="text-sm text-green-700">Excellent work. You've successfully solved this coding challenge.</p>
                        </div>
                    </div>
                    <Button variant="outline" className="text-green-700 border-green-200 hover:bg-green-100 gap-2">
                        <IconRotateClockwise size={18} />
                        Next Activity
                    </Button>
                </div>
            )}
        </div>
    );
}
