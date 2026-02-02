"use client";

import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { IconCode, IconAlertCircle } from "@tabler/icons-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CodeExerciseProps {
    exercise: any;
    isExerciseCompleted: boolean;
    studentId: string;
    courseId: string;
    children: ReactNode;
}

export default function CodeExercise({
    exercise,
    isExerciseCompleted,
    children,
}: CodeExerciseProps) {
    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
                                Coding Challenge
                            </Badge>
                            {isExerciseCompleted && (
                                <Badge className="bg-green-100 text-green-700">Completed</Badge>
                            )}
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">{exercise.title}</h1>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="environment" className="space-y-4">
                <TabsList className="bg-muted/50 p-1">
                    <TabsTrigger value="environment" className="gap-2">
                        <IconCode size={18} />
                        Workspace
                    </TabsTrigger>
                    <TabsTrigger value="instructions" className="gap-2">
                        <IconAlertCircle size={18} />
                        Detailed Instructions
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="environment" className="mt-0">
                    <div className="grid grid-cols-1 gap-6">
                        {children}
                    </div>
                </TabsContent>

                <TabsContent value="instructions">
                    <div className="bg-card border rounded-xl p-8 max-w-3xl mx-auto shadow-sm">
                        <h2 className="text-2xl font-bold mb-4">Problem Description</h2>
                        <div className="prose prose-slate dark:prose-invert max-w-none">
                            <p className="text-lg text-muted-foreground mb-6">
                                {exercise.description}
                            </p>
                            <div className="bg-muted p-6 rounded-lg border border-border">
                                <h3 className="not-prose text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tasks</h3>
                                {exercise.instructions}
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
