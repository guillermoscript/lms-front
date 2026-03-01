"use client";

import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { IconCheck, IconClock, IconFlame, IconInfoCircle, IconSparkles } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";

interface EssayExerciseProps {
    exercise: any;
    exerciseId: string;
    courseId: string;
    isExerciseCompleted: boolean;
    profile: any;
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
};

export default function EssayExercise({
    exercise,
    isExerciseCompleted,
    children,
    isExerciseCompletedSection,
}: EssayExerciseProps) {
    const difficulty = difficultyConfig[exercise.difficulty_level] || difficultyConfig.easy;
    const DifficultyIcon = difficulty.icon;
    const typeLabel = typeLabels[exercise.exercise_type] || "Exercise";

    return (
        <div className="space-y-6">
            {/* Exercise Header */}
            <div className="space-y-4">
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

                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-balance leading-tight">
                    {exercise.title}
                </h1>

                {exercise.description && (
                    <div className="text-muted-foreground text-sm md:text-base leading-relaxed max-w-2xl prose prose-sm prose-neutral dark:prose-invert prose-p:text-muted-foreground prose-p:leading-relaxed">
                        <Markdown>{exercise.description}</Markdown>
                    </div>
                )}
            </div>

            {/* Main Layout: Instructions + Chat */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Instructions */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="rounded-2xl border-2 border-primary/10 bg-gradient-to-b from-primary/[0.03] to-transparent overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-primary/10 bg-primary/[0.03]">
                            <h2 className="font-bold text-xs flex items-center gap-2 text-primary uppercase tracking-wider">
                                <IconInfoCircle size={14} aria-hidden="true" />
                                Instructions
                            </h2>
                        </div>
                        <div className="px-5 py-4">
                            <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert prose-p:leading-relaxed prose-p:text-foreground/80 prose-strong:text-foreground prose-headings:text-foreground prose-headings:font-bold prose-li:text-foreground/80 prose-headings:text-sm">
                                <Markdown>{exercise.instructions}</Markdown>
                            </div>
                        </div>
                    </div>

                    {/* Other Exercises */}
                    {isExerciseCompletedSection && (
                        <div className="space-y-4">
                            {isExerciseCompletedSection}
                        </div>
                    )}
                </div>

                {/* Right Column: AI Chat */}
                <div className="lg:col-span-8">
                    <div className="lg:sticky lg:top-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
