"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconFileText, IconClock, IconChartBar, IconCheck, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface ExamCardProps {
    exam: any;
    courseId: string;
}

export default function ExamCard({ exam, courseId }: ExamCardProps) {
    const submission = exam.exam_submissions?.[0];
    const score = submission?.exam_scores?.[0]?.score;
    const isCompleted = !!submission && score !== undefined;

    return (
        <Card className="hover:shadow-md transition-all duration-300 border-muted-foreground/10 group overflow-hidden">
            <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                    {/* Status Bar */}
                    <div className={cn(
                        "w-full md:w-2 transition-colors",
                        isCompleted ? "bg-green-500" : "bg-primary"
                    )} />

                    <div className="flex-1 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-start gap-4 flex-1">
                            <div className={cn(
                                "p-3 rounded-2xl transition-colors",
                                isCompleted ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white"
                            )}>
                                {isCompleted ? <IconCheck size={24} /> : <IconFileText size={24} />}
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-xl">{exam.title}</h3>
                                    {isCompleted && (
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                            Completed
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-muted-foreground line-clamp-1">{exam.description || "Final comprehensive evaluation."}</p>

                                <div className="flex items-center gap-4 pt-2 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <IconClock size={16} />
                                        {exam.duration} minutes
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <IconChartBar size={16} />
                                        Sequence {exam.sequence || 1}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-center md:items-end gap-3 min-w-[140px]">
                            {isCompleted ? (
                                <div className="text-center md:text-right">
                                    <div className="text-3xl font-black text-green-600">
                                        {Math.round(score)}%
                                    </div>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Final Score</p>
                                </div>
                            ) : (
                                <div className="text-center md:text-right">
                                    <Badge variant="secondary" className="mb-1">Not Started</Badge>
                                    <p className="text-xs text-muted-foreground">Ready to begin?</p>
                                </div>
                            )}

                            <Link
                                href={isCompleted
                                    ? `/dashboard/student/courses/${courseId}/exams/${exam.exam_id}/result`
                                    : `/dashboard/student/courses/${courseId}/exams/${exam.exam_id}`
                                }
                                className="w-full"
                            >
                                <button className={cn(
                                    "w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-semibold transition-all",
                                    isCompleted
                                        ? "bg-muted hover:bg-muted/80 text-foreground"
                                        : "bg-primary text-white hover:shadow-lg hover:shadow-primary/20"
                                )}>
                                    {isCompleted ? "View Results" : "Start Exam"}
                                    <IconChevronRight size={18} />
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
