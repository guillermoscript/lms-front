"use client";

import { ReactNode } from "react";
import { useTranslations } from "next-intl";
import ExerciseBrief from "@/components/exercises/exercise-brief";
import ExerciseHeader from "@/components/exercises/exercise-header";
import ExerciseWorkspace, { initialWorkspacePanel } from "@/components/exercises/exercise-workspace";

interface CodeExerciseProps {
    exercise: {
        title: string;
        description?: string | null;
        instructions?: string | null;
        difficulty_level?: string | null;
        time_limit?: number | null;
    };
    isExerciseCompleted: boolean;
    studentId: string;
    courseId: string;
    /** The editor. */
    children: ReactNode;
    /** Prior completion record, shown when the student returns to a solved challenge. */
    resultSummary?: ReactNode;
    related?: ReactNode;
}

/**
 * The same shell as every other engine, with the editor filling the work pane:
 * task on the left, code over its output on the right.
 *
 * The task used to live in a second tab ("Detailed Instructions"), so a
 * student landed on an empty editor with no statement of what to build.
 */
export default function CodeExercise({
    exercise,
    isExerciseCompleted,
    children,
    resultSummary,
    related,
}: CodeExerciseProps) {
    const t = useTranslations("exercises.code");
    const tWorkspace = useTranslations("exercises.workspace");

    return (
        <div className="lg:h-full">
            <ExerciseWorkspace
                header={
                    <ExerciseHeader
                        typeLabel={t("typeLabel")}
                        title={exercise.title}
                        description={exercise.description}
                        difficulty={exercise.difficulty_level}
                        timeLimit={exercise.time_limit}
                        completed={isExerciseCompleted}
                    />
                }
                brief={
                    <div className="space-y-6">
                        <ExerciseBrief instructions={exercise.instructions ?? ""} />
                        {/* Beside the task it answers, not over the editor. */}
                        <div className="hidden lg:block">{resultSummary}</div>
                    </div>
                }
                task={children}
                taskLabel={tWorkspace("code")}
                // A phone gets it as its own tab; the desktop copy is in the brief.
                result={resultSummary ? <div className="lg:hidden">{resultSummary}</div> : undefined}
                resultPassed
                related={related}
                initialPanel={initialWorkspacePanel({
                    hasResult: false,
                    passed: true,
                    attempted: isExerciseCompleted,
                })}
                fillTask
            />
        </div>
    );
}
