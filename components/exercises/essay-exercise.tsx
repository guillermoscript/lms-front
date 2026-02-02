"use client";

import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { IconBook, IconMessageCircle, IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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

export default function EssayExercise({
    exercise,
    isExerciseCompleted,
    children,
    isExerciseCompletedSection,
}: EssayExerciseProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
            {/* Left Column: Instructions & Context */}
            <div className="lg:col-span-4 space-y-6">
                <Card className="border-none shadow-sm bg-primary/5">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                Essay Activity
                            </Badge>
                            {isExerciseCompleted && (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                    Done
                                </Badge>
                            )}
                        </div>
                        <CardTitle className="text-2xl font-bold">{exercise.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="text-muted-foreground leading-relaxed">
                            {exercise.description}
                        </div>

                        <div className="pt-4 border-t border-primary/10">
                            <h4 className="font-semibold flex items-center gap-2 mb-2 text-primary">
                                <IconInfoCircle size={18} />
                                Instructions
                            </h4>
                            <div className="prose prose-sm prose-slate max-w-none dark:prose-invert">
                                {exercise.instructions}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {isExerciseCompletedSection && (
                    <div className="space-y-4 px-1">
                        {isExerciseCompletedSection}
                    </div>
                )}
            </div>

            {/* Right Column: Interaction */}
            <div className="lg:col-span-8">
                <div className="sticky top-6">
                    {children}

                    {/* Progress indicator */}
                    {!isExerciseCompleted && (
                        <div className="mt-4 px-2">
                            <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                                <span>Exercise Progress</span>
                                <span>AI is evaluating your response...</span>
                            </div>
                            <Progress value={33} className="h-1.5" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
