"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconFileText, IconClock, IconChartBar, IconCheck, IconChevronRight, IconHourglass } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface ExamCardProps {
    exam: any;
    courseId: string;
}

export default function ExamCard({ exam, courseId }: ExamCardProps) {
    const submission = exam.exam_submissions?.[0];
    const score = submission?.score ?? submission?.exam_scores?.[0]?.score;
    const hasScore = score !== undefined && score !== null;
    const hasSubmission = !!submission;
    const reviewStatus = submission?.review_status as string | null;

    // 3 states: completed (has score), submitted (has submission but no score), not started
    const isCompleted = hasSubmission && hasScore;
    const isSubmitted = hasSubmission && !hasScore;

    const statusBarColor = isCompleted
        ? "bg-green-500"
        : isSubmitted
            ? "bg-amber-500"
            : "bg-primary";

    const iconBg = isCompleted
        ? "bg-green-100 text-green-600"
        : isSubmitted
            ? "bg-amber-100 text-amber-600"
            : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white";

    const linkHref = (isCompleted || isSubmitted)
        ? `/dashboard/student/courses/${courseId}/exams/${exam.exam_id}/result`
        : `/dashboard/student/courses/${courseId}/exams/${exam.exam_id}`;

    return (
        <Card className="hover:shadow-md transition-all duration-300 border-muted-foreground/10 group overflow-hidden">
            <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                    {/* Status Bar */}
                    <div className={cn(
                        "w-full h-1 md:h-auto md:w-2 transition-colors",
                        statusBarColor
                    )} />

                    <div className="flex-1 p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
                        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                            <div className={cn(
                                "p-2.5 sm:p-3 rounded-2xl transition-colors shrink-0",
                                iconBg
                            )}>
                                {isCompleted
                                    ? <IconCheck className="h-5 w-5 sm:h-6 sm:w-6" />
                                    : isSubmitted
                                        ? <IconHourglass className="h-5 w-5 sm:h-6 sm:w-6" />
                                        : <IconFileText className="h-5 w-5 sm:h-6 sm:w-6" />
                                }
                            </div>

                            <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-bold text-base sm:text-xl">{exam.title}</h3>
                                    {isCompleted && (
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] sm:text-xs">
                                            Completed
                                        </Badge>
                                    )}
                                    {isSubmitted && (
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] sm:text-xs">
                                            {reviewStatus === 'pending_teacher_review' ? 'Pending Review' : 'Submitted'}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-muted-foreground text-sm line-clamp-1">{exam.description || "Final comprehensive evaluation."}</p>

                                <div className="flex items-center gap-3 sm:gap-4 pt-1.5 sm:pt-2 text-xs sm:text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <IconClock size={14} />
                                        {exam.duration} minutes
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <IconChartBar size={14} />
                                        Sequence {exam.sequence || 1}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-stretch sm:items-end gap-2.5 sm:gap-3 w-full sm:w-auto sm:min-w-[140px]">
                            {isCompleted ? (
                                <div className="text-center sm:text-right">
                                    <div className="text-2xl sm:text-3xl font-black text-green-600">
                                        {Math.round(score)}%
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">Final Score</p>
                                </div>
                            ) : isSubmitted ? (
                                <div className="text-center sm:text-right">
                                    <div className="text-base sm:text-lg font-bold text-amber-600">
                                        Awaiting Grade
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                                        {reviewStatus === 'pending_teacher_review'
                                            ? 'Teacher will review'
                                            : 'Being evaluated'}
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center sm:text-right">
                                    <Badge variant="secondary" className="mb-1">Not Started</Badge>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground">Ready to begin?</p>
                                </div>
                            )}

                            <Link href={linkHref} className="w-full sm:w-auto">
                                <button className={cn(
                                    "w-full flex items-center justify-center gap-2 py-2.5 sm:py-2 px-4 rounded-xl font-semibold transition-all text-sm",
                                    isCompleted
                                        ? "bg-muted hover:bg-muted/80 text-foreground"
                                        : isSubmitted
                                            ? "bg-amber-500 text-white hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/20"
                                            : "bg-primary text-white hover:shadow-lg hover:shadow-primary/20"
                                )}>
                                    {isCompleted ? "View Results" : isSubmitted ? "View Results" : "Start Exam"}
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
