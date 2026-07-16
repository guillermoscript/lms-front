"use client";

import { ReactNode } from "react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import type { Database } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { IconCheck, IconClock, IconFlame, IconInfoCircle, IconSparkles } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import { ExerciseWorkspace } from "@/components/exercises/exercise-workspace";

type ExerciseRow = Pick<
    Database["public"]["Tables"]["exercises"]["Row"],
    "description" | "difficulty_level" | "exercise_type" | "instructions" | "time_limit" | "title"
>;

interface EssayExerciseProps {
    exercise: ExerciseRow;
    exerciseId: string;
    courseId: string;
    isExerciseCompleted: boolean;
    profile: { full_name: string | null } | null;
    studentId: string;
    children: ReactNode;
    isExerciseCompletedSection?: ReactNode;
}

const difficultyConfig: Record<string, { label: string; color: string; icon: typeof IconFlame }> = {
    easy: { label: "Beginner", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", icon: IconSparkles },
    medium: { label: "Intermediate", color: "text-amber-600 bg-amber-500/10 border-amber-500/20", icon: IconFlame },
    hard: { label: "Advanced", color: "text-rose-600 bg-rose-500/10 border-rose-500/20", icon: IconFlame },
};

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
}: EssayExerciseProps) {
    const t = useTranslations("exercises.workspace");
    const difficulty = difficultyConfig[exercise.difficulty_level] || difficultyConfig.easy;
    const DifficultyIcon = difficulty.icon;
    const typeLabel = typeLabels[exercise.exercise_type] || "Exercise";

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Exercise Header */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-3 sm:space-y-4"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-bold border-2 text-primary border-primary/20 bg-primary/5 uppercase tracking-wider text-[10px] px-2.5 py-0.5">
                        {typeLabel}
                    </Badge>
                    <Badge variant="outline" className={cn("font-bold border text-[10px] px-2.5 py-0.5 uppercase tracking-wider", difficulty.color)}>
                        <DifficultyIcon size={11} className="mr-1" aria-hidden="true" />
                        {difficulty.label}
                    </Badge>
                    {exercise.time_limit && (
                        <Badge variant="outline" className="font-bold border text-[10px] px-2.5 py-0.5 uppercase tracking-wider text-muted-foreground">
                            <IconClock size={11} className="mr-1" aria-hidden="true" />
                            {exercise.time_limit} min
                        </Badge>
                    )}
                    {isExerciseCompleted && (
                        <Badge className="bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-0.5 uppercase tracking-wider">
                            <IconCheck size={11} className="mr-1" aria-hidden="true" />
                            Completed
                        </Badge>
                    )}
                </div>

                <h1 className="max-w-3xl text-2xl font-bold leading-tight tracking-tight text-balance md:text-3xl">
                    {exercise.title}
                </h1>

                {exercise.description && (
                    <div className="max-w-2xl text-base leading-relaxed text-muted-foreground prose prose-sm prose-neutral dark:prose-invert prose-p:leading-relaxed prose-p:text-muted-foreground md:text-base">
                        <Markdown>{exercise.description}</Markdown>
                    </div>
                )}
            </motion.div>

            {/* Responsive task/chat workspace */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 }}
            >
                <ExerciseWorkspace
                    task={
                    <div className="overflow-hidden rounded-xl border border-primary/15 bg-card sm:rounded-2xl">
                        <div className="border-b border-primary/10 bg-primary/[0.06] px-4 py-3 sm:px-5 sm:py-3.5">
                            <h2 className="flex items-center gap-2 text-xs font-bold tracking-wide text-primary">
                                <IconInfoCircle size={14} aria-hidden="true" />
                                {t("instructions")}
                            </h2>
                        </div>
                        <div className="px-4 py-4 sm:px-5 sm:py-5">
                            <div className="prose prose-sm max-w-none prose-headings:text-sm prose-headings:font-bold prose-headings:text-foreground prose-li:text-foreground/80 prose-neutral prose-p:leading-relaxed prose-p:text-foreground/80 prose-strong:text-foreground dark:prose-invert">
                                <Markdown>{exercise.instructions}</Markdown>
                            </div>
                        </div>
                    </div>
                    }
                    aiChat={children}
                    supportingContent={isExerciseCompletedSection}
                />
            </motion.div>
        </div>
    );
}
