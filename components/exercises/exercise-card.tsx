"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconClock, IconCheck, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { EXERCISE_TYPE_ICONS, FALLBACK_EXERCISE_ICON, isKnownExerciseType } from "@/components/exercises/exercise-type-meta";

interface ExerciseCardProps {
    exercise: {
        id: number;
        title: string;
        description?: string | null;
        exercise_type: string;
        difficulty_level?: string | null;
        time_limit?: number | null;
        exercise_completions?: unknown[] | null;
    };
    courseId: string;
}

export default function ExerciseCard({ exercise, courseId }: ExerciseCardProps) {
    const t = useTranslations("exercises.list");
    const tTypes = useTranslations("exercises.types");
    const tDifficulty = useTranslations("exercises.difficulty");
    const isCompleted = (exercise.exercise_completions?.length ?? 0) > 0;

    const TypeIcon = EXERCISE_TYPE_ICONS[exercise.exercise_type] ?? FALLBACK_EXERCISE_ICON;
    const typeLabel = isKnownExerciseType(exercise.exercise_type)
        ? tTypes(exercise.exercise_type)
        : exercise.exercise_type;

    const difficultyColor = {
        easy: "bg-success/10 text-success border-success/20",
        medium: "bg-warning/10 text-warning border-warning/20",
        hard: "bg-destructive/10 text-destructive border-destructive/20",
    }[exercise.difficulty_level as string] || "bg-muted text-muted-foreground border-border";

    return (
        <Link href={`/dashboard/student/courses/${courseId}/exercises/${exercise.id}`} className="block group">
            <Card className="h-full hover:shadow-lg hover:border-primary/20 active:scale-[0.98] transition-all duration-200 overflow-hidden">
                <CardContent className="p-4 sm:p-5">
                    {/* The kind of exercise reads before the title: a student
                        picking from a dozen cards is choosing an activity, not
                        a headline (it used to be 10px type in the footer). */}
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className={cn(
                            "p-2.5 rounded-xl transition-transform duration-200 shrink-0",
                            isCompleted ? "bg-success/10 text-success" : "bg-brand-tint text-brand-text group-hover:scale-110"
                        )}>
                            <TypeIcon size={20} />
                        </div>
                        <span className="text-sm font-medium text-foreground truncate">{typeLabel}</span>
                        {exercise.difficulty_level && (
                            <Badge variant="outline" className={cn("ml-auto shrink-0 rounded-md px-2 py-0 text-xs", difficultyColor)}>
                                {["easy", "medium", "hard"].includes(exercise.difficulty_level)
                                    ? tDifficulty(exercise.difficulty_level as "easy" | "medium" | "hard")
                                    : exercise.difficulty_level}
                            </Badge>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <h3 className="font-bold text-base leading-tight group-hover:text-brand-text transition-colors line-clamp-2">
                            {exercise.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed min-h-[40px]">
                            {exercise.description || t("cardFallbackDescription")}
                        </p>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2.5 sm:mt-4 sm:pt-3 border-t border-border/50">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {exercise.time_limit && (
                                <span className="flex items-center gap-1">
                                    <IconClock size={14} aria-hidden="true" />
                                    {t("minutes", { minutes: exercise.time_limit })}
                                </span>
                            )}
                            {isCompleted && (
                                <span className="flex items-center gap-1 text-success">
                                    <IconCheck size={14} aria-hidden="true" />
                                    {t("completed")}
                                </span>
                            )}
                        </div>
                        <IconChevronRight
                            size={16}
                            stroke={3}
                            className="text-brand-text/40 sm:text-brand-text/0 sm:group-hover:text-brand-text transition-all sm:group-hover:translate-x-0.5"
                        />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
