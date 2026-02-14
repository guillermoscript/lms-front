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
        easy: "bg-emerald-50 text-emerald-700 border-emerald-100",
        medium: "bg-amber-50 text-amber-700 border-amber-100",
        hard: "bg-rose-50 text-rose-700 border-rose-100",
    }[exercise.difficulty_level as string] || "bg-muted text-muted-foreground";

    return (
        <Link href={`/dashboard/student/courses/${courseId}/exercises/${exercise.id}`} className="block group">
            <Card className="h-full hover:shadow-xl transition-all duration-300 border-muted-foreground/10 overflow-hidden relative">
                {isCompleted && (
                    <div className="absolute top-0 right-0 p-3 z-10">
                        <div className="bg-emerald-500 text-white p-1 rounded-full shadow-lg border-2 border-white">
                            <IconCheck size={14} stroke={4} />
                        </div>
                    </div>
                )}

                <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className={cn(
                            "p-3 rounded-2xl transition-all duration-300",
                            isCompleted ? "bg-emerald-100 text-emerald-600" : "bg-primary/10 text-primary group-hover:scale-110"
                        )}>
                            <TypeIcon size={24} />
                        </div>
                        <Badge variant="outline" className={cn("rounded-md font-bold px-2 py-0", difficultyColor)}>
                            {exercise.difficulty_level}
                        </Badge>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-black text-xl leading-tight group-hover:text-primary transition-colors line-clamp-2">
                            {exercise.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                            {exercise.description || "Interactive practice session to reinforce your learning."}
                        </p>
                    </div>

                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-muted/30">
                        <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            <div className="flex items-center gap-1.5">
                                <IconClock size={16} />
                                {exercise.time_limit || "15"}m
                            </div>
                            <div className="flex items-center gap-1.5">
                                <IconChartBar size={16} />
                                {config.label}
                            </div>
                        </div>
                        <div className="text-primary opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                            <IconChevronRight size={20} stroke={3} />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

