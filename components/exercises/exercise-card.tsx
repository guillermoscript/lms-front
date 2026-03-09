"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconCode, IconMessage, IconClock, IconChartBar, IconCheck, IconChevronRight, IconMessageCircle, IconListCheck, IconCircleCheck, IconTextSize } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface ExerciseCardProps {
    exercise: any;
    courseId: string;
}

export default function ExerciseCard({ exercise, courseId }: ExerciseCardProps) {
    const isCompleted = exercise.exercise_completions?.length > 0;

    const typeConfig: Record<string, { icon: typeof IconCode; label: string }> = {
        coding_challenge: { icon: IconCode, label: "Code" },
        essay: { icon: IconMessage, label: "Essay" },
        discussion: { icon: IconMessageCircle, label: "Discussion" },
        quiz: { icon: IconListCheck, label: "Quiz" },
        multiple_choice: { icon: IconCircleCheck, label: "Multiple Choice" },
        fill_in_the_blank: { icon: IconTextSize, label: "Fill in Blank" },
    };

    const config = typeConfig[exercise.exercise_type] || typeConfig.essay;
    const TypeIcon = config.icon;

    const difficultyColor = {
        easy: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
        medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
        hard: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    }[exercise.difficulty_level as string] || "bg-muted text-muted-foreground border-border";

    return (
        <Link href={`/dashboard/student/courses/${courseId}/exercises/${exercise.id}`} className="block group">
            <Card className="h-full hover:shadow-lg hover:border-primary/20 active:scale-[0.98] transition-all duration-200 overflow-hidden relative">
                {isCompleted && (
                    <div className="absolute top-3 right-3 z-10">
                        <div className="bg-emerald-500 text-white p-1 rounded-full shadow-md">
                            <IconCheck size={12} stroke={4} />
                        </div>
                    </div>
                )}

                <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between mb-3">
                        <div className={cn(
                            "p-2.5 rounded-xl transition-transform duration-200",
                            isCompleted ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary group-hover:scale-110"
                        )}>
                            <TypeIcon size={20} />
                        </div>
                        <Badge variant="outline" className={cn("rounded-md font-bold px-2 py-0 text-[10px] uppercase tracking-wider", difficultyColor)}>
                            {exercise.difficulty_level}
                        </Badge>
                    </div>

                    <div className="space-y-1.5">
                        <h3 className="font-bold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
                            {exercise.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[32px]">
                            {exercise.description || "Interactive practice session to reinforce your learning."}
                        </p>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2.5 sm:mt-4 sm:pt-3 border-t border-border/50">
                        <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            {exercise.time_limit && (
                                <div className="flex items-center gap-1">
                                    <IconClock size={12} />
                                    {exercise.time_limit}m
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <IconChartBar size={12} />
                                {config.label}
                            </div>
                        </div>
                        <IconChevronRight
                            size={16}
                            stroke={3}
                            className="text-primary/40 sm:text-primary/0 sm:group-hover:text-primary transition-all sm:group-hover:translate-x-0.5"
                        />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
