"use client";

import { ReactNode } from "react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import ExerciseBrief from "@/components/exercises/exercise-brief";
import ExerciseHeader from "@/components/exercises/exercise-header";
import ExerciseWorkspace, { initialWorkspacePanel } from "@/components/exercises/exercise-workspace";

interface EssayExerciseProps {
    exercise: any;
    exerciseId: string;
    courseId: string;
    isExerciseCompleted: boolean;
    profile: any;
    studentId: string;
    children: ReactNode;
    isExerciseCompletedSection?: ReactNode;
    /** Last graded attempt, shown when the student returns. */
    resultSummary?: ReactNode;
    /** Whether that attempt passed — drives which panel opens on a phone. */
    resultPassed?: boolean;
}

const typeLabels: Record<string, string> = {
    essay: "Essay",
    discussion: "Discussion",
    quiz: "Quiz",
    multiple_choice: "Multiple Choice",
    fill_in_the_blank: "Fill in the Blank",
    coding_challenge: "Coding Challenge",
    video_evaluation: "Video",
    audio_evaluation: "Audio",
};

export default function EssayExercise({
    exercise,
    isExerciseCompleted,
    children,
    isExerciseCompletedSection,
    resultSummary,
    resultPassed,
}: EssayExerciseProps) {
    const t = useTranslations("exercises.workspace");
    const typeLabel = typeLabels[exercise.exercise_type] || "Exercise";

    return (
        <div className="space-y-4 sm:space-y-6">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <ExerciseHeader
                    typeLabel={typeLabel}
                    title={exercise.title}
                    description={exercise.description}
                    difficulty={exercise.difficulty_level}
                    timeLimit={exercise.time_limit}
                    completed={isExerciseCompleted}
                />
            </motion.div>

            <ExerciseWorkspace
                brief={<ExerciseBrief instructions={exercise.instructions} />}
                task={children}
                taskLabel={t("coach")}
                result={resultSummary}
                resultPassed={resultPassed}
                related={isExerciseCompletedSection}
                initialPanel={initialWorkspacePanel({
                    hasResult: Boolean(resultSummary),
                    passed: resultPassed,
                    attempted: isExerciseCompleted || Boolean(resultSummary),
                })}
            />
        </div>
    );
}
