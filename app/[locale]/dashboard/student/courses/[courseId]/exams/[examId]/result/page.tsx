import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTrophy, IconCheck, IconX, IconClock, IconMessageChatbot, IconArrowLeft, IconUserCheck, IconHourglass, IconCertificate } from '@tabler/icons-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getCurrentUserId } from '@/lib/supabase/tenant'

interface PageProps {
    params: Promise<{ courseId: string; examId: string }>
}

export default async function ExamResultPage({ params }: PageProps) {
    const { courseId, examId } = await params
    const supabase = await createClient()

    const userId = await getCurrentUserId()
    if (!userId) redirect('/auth/login')

    // Fetch complete exam data as requested by user
    const { data: examData, error } = await supabase
        .from('exams')
        .select(`
        exam_id,
        title,
        description,
        duration,
        exam_date,
        created_by,
        courses (
          title,
          course_id
        ),
        exam_questions (
          question_id,
          question_text,
          question_type,
          question_options (
            option_id,
            is_correct,
            option_text
          )
        ),
        exam_submissions (
          submission_id,
          student_id,
          submission_date,
          ai_data,
          review_status,
          score,
          exam_answers (
            answer_id,
            question_id,
            answer_text,
            is_correct,
            feedback
          ),
          exam_scores (
            score_id,
            score
          ),
          exam_question_scores (
            score_id,
            question_id,
            points_earned,
            points_possible,
            is_correct,
            ai_feedback,
            ai_confidence,
            teacher_notes,
            is_overridden
          )
        )
    `)
        .eq('exam_id', parseInt(examId))
        .eq('exam_submissions.student_id', userId)
        .single()

    if (error || !examData) {
        console.error('Error fetching exam data:', error)
        notFound()
    }

    const submission = examData.exam_submissions?.[0]
    if (!submission) {
        redirect(`/dashboard/student/courses/${courseId}/exams/${examId}`)
    }

    // Check if a certificate was issued for this course
    const { data: certificate } = await supabase
        .from('certificates')
        .select('certificate_id, verification_code')
        .eq('user_id', userId)
        .eq('course_id', parseInt(courseId))
        .maybeSingle()

    const score = submission.score ?? submission.exam_scores?.[0]?.score
    const aiData = submission.ai_data as any
    const reviewStatus = submission.review_status as string | null
    const questionScoresByQuestionId = (submission.exam_question_scores || []).reduce(
        (acc: any, qs: any) => {
            acc[qs.question_id] = qs
            return acc
        },
        {}
    )
    const answersByQuestionId = (submission.exam_answers || []).reduce(
        (acc: any, answer: any) => {
            acc[answer.question_id] = answer
            return acc
        },
        {}
    )

    // Match answer_text to an option — answer_text may be the option_id (MC)
    // or the literal text "True"/"False" (TF), so check both
    function findSelectedOption(options: any[], answerText: string | null | undefined) {
        if (!answerText || !options) return null
        return options.find((opt: any) =>
            opt.option_id.toString() === answerText ||
            opt.option_text.toLowerCase() === answerText.toLowerCase()
        ) || null
    }

    // Build a lookup of whether the student's answer was correct per question
    const correctOptionsByQuestion = (examData.exam_questions || []).reduce(
        (acc: Record<number, boolean>, q: any) => {
            if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
                const answer = answersByQuestionId[q.question_id]
                if (answer) {
                    const selectedOpt = findSelectedOption(q.question_options, answer.answer_text)
                    acc[q.question_id] = !!selectedOpt?.is_correct
                }
            }
            return acc
        },
        {}
    )

    const firstExam = examData;
    const courseData = firstExam?.courses;
    const courseTitle = (Array.isArray(courseData) ? courseData[0]?.title : (courseData as any)?.title) || "Course";

    const breadcrumbLinks = [
        { href: '/dashboard/student', label: 'Dashboard' },
        { href: `/dashboard/student/courses/${courseId}`, label: courseTitle },
        { href: `/dashboard/student/courses/${courseId}/exams`, label: 'Exams' },
        { href: '#', label: 'Results' },
    ]

    return (
        <div className="container mx-auto py-5 sm:py-8 px-4 space-y-5 sm:space-y-8 animate-in fade-in duration-500">
            <BreadcrumbComponent links={breadcrumbLinks} />

            {/* Score Header */}
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-5 sm:p-8 md:p-12 text-white shadow-2xl shadow-indigo-200">
                <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-10">
                    <IconTrophy className="h-24 w-24 sm:h-[180px] sm:w-[180px]" stroke={1} />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-8">
                    <div className="space-y-3 sm:space-y-4 text-center md:text-left">
                        <Badge variant="outline" className="text-white border-white/30 bg-white/10 px-3 py-1">
                            Exam Completed
                        </Badge>
                        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black">{examData.title}</h1>
                        <p className="text-indigo-100 max-w-lg text-sm sm:text-base">{examData.description}</p>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 sm:gap-6 pt-2 sm:pt-4">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 sm:p-2 rounded-lg bg-white/10">
                                    <IconClock size={18} />
                                </div>
                                <span className="text-xs sm:text-sm font-medium">Completed on {new Date(submission.submission_date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 text-indigo-950 dark:text-white rounded-2xl p-5 sm:p-8 flex flex-col items-center justify-center shadow-xl w-full md:w-auto md:min-w-[200px]">
                        <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1">Final Score</span>
                        <div className="text-5xl sm:text-6xl font-black mb-2">{Math.round(score || 0)}%</div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-3 sm:mt-4">
                            <div
                                className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-1000"
                                style={{ width: `${score || 0}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Review Status Banner */}
            {reviewStatus === 'pending_teacher_review' && (
                <Card className="border-2 border-amber-200 dark:border-amber-800 shadow-lg overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
                    <CardContent className="p-4 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 bg-amber-100 dark:bg-amber-900/40 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
                            <IconHourglass className="h-5 w-5 sm:h-7 sm:w-7" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-amber-900 dark:text-amber-200">Pending Teacher Review</h3>
                            <p className="text-amber-800 dark:text-amber-300 text-sm">
                                Your multiple choice and true/false answers have been auto-graded. Free-text answers are awaiting teacher evaluation. Your final score may change after review.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {reviewStatus === 'ai_reviewed' && (
                <Card className="border-2 border-green-200 dark:border-green-800 shadow-lg overflow-hidden bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
                    <CardContent className="p-4 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 bg-green-100 dark:bg-green-900/40 rounded-xl text-green-600 dark:text-green-400 shrink-0">
                            <IconMessageChatbot className="h-5 w-5 sm:h-7 sm:w-7" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-green-900 dark:text-green-200">AI Evaluated</h3>
                            <p className="text-green-800 dark:text-green-300 text-sm">
                                All answers have been evaluated by AI. Your teacher may still review and adjust scores.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {reviewStatus === 'teacher_reviewed' && (
                <Card className="border-2 border-blue-200 dark:border-blue-800 shadow-lg overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
                    <CardContent className="p-4 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 bg-blue-100 dark:bg-blue-900/40 rounded-xl text-blue-600 dark:text-blue-400 shrink-0">
                            <IconUserCheck className="h-5 w-5 sm:h-7 sm:w-7" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-blue-900 dark:text-blue-200">Teacher Reviewed</h3>
                            <p className="text-blue-800 dark:text-blue-300 text-sm">
                                Your exam has been reviewed and finalized by your teacher.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Certificate Banner */}
            {certificate && (
                <Card className="border-2 border-emerald-200 dark:border-emerald-800 shadow-lg overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                    <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
                            <IconCertificate className="h-5 w-5 sm:h-7 sm:w-7" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-lg text-emerald-900 dark:text-emerald-200">Certificate Earned!</h3>
                            <p className="text-emerald-800 dark:text-emerald-300 text-sm">
                                Congratulations! You have completed all requirements for this course and earned a certificate.
                            </p>
                        </div>
                        <Link href={`/verify/${certificate.verification_code}`}>
                            <Button variant="outline" className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 font-bold gap-2 whitespace-nowrap">
                                <IconCertificate className="h-4 w-4" />
                                View Certificate
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            {/* AI Analysis Section */}
            {aiData && (
                <Card className="border-2 border-blue-200 dark:border-blue-800 shadow-lg overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
                    <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700 p-4 sm:p-6 text-white">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-lg shrink-0">
                                <IconMessageChatbot className="h-5 w-5 sm:h-7 sm:w-7" />
                            </div>
                            <CardTitle className="text-base sm:text-xl font-bold">AI Performance Analysis</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                        <div className="prose prose-lg dark:prose-invert max-w-none">
                            <p className="text-gray-900 dark:text-gray-100 leading-relaxed font-medium text-base">
                                {aiData.summary || "Your performance has been evaluated. Review the detailed feedback per question below."}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Detailed Review */}
            <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold px-1 sm:px-2">Detailed Question Review</h2>
                <div className="space-y-4">
                    {examData.exam_questions?.map((question: any, idx: number) => {
                        const answer = answersByQuestionId[question.question_id];
                        const qScore = questionScoresByQuestionId[question.question_id];
                        // For MC/TF, derive correctness from the options (ground truth);
                        // for free_text, fall back to scored/answer fields
                        const isCorrect = (question.question_type === 'multiple_choice' || question.question_type === 'true_false')
                            ? correctOptionsByQuestion[question.question_id] ?? qScore?.is_correct ?? answer?.is_correct
                            : qScore?.is_correct ?? answer?.is_correct;
                        const isFreeTextPending = question.question_type === 'free_text' && (!qScore?.ai_feedback || qScore?.ai_confidence === 0);

                        return (
                            <Card key={question.question_id} className={cn(
                                "border-2 transition-all duration-300",
                                isFreeTextPending
                                    ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20"
                                    : isCorrect
                                        ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20"
                                        : "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20"
                            )}>
                                <CardHeader className="pb-3 border-b border-muted/10 px-4 sm:px-6">
                                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-widest">
                                                Question {idx + 1}
                                                <Badge variant="secondary" className="lowercase font-medium text-[10px] sm:text-xs">{question.question_type.replace('_', ' ')}</Badge>
                                            </div>
                                            <h3 className="text-base sm:text-xl font-bold">{question.question_text}</h3>
                                        </div>
                                        <div className={cn(
                                            "p-1.5 sm:p-2 rounded-xl shrink-0",
                                            isFreeTextPending
                                                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
                                                : isCorrect
                                                    ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                                                    : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                                        )}>
                                            {isFreeTextPending ? <IconHourglass className="h-5 w-5 sm:h-7 sm:w-7" /> : isCorrect ? <IconCheck className="h-5 w-5 sm:h-7 sm:w-7" /> : <IconX className="h-5 w-5 sm:h-7 sm:w-7" />}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4 sm:pt-6 space-y-3 sm:space-y-4 px-4 sm:px-6">
                                    {/* Multiple Choice Options */}
                                    {question.question_type === 'multiple_choice' && (
                                        <div className="grid gap-2.5 sm:gap-3">
                                            {question.question_options?.map((opt: any) => {
                                                const isSelected = answer?.answer_text === opt.option_id.toString()
                                                    || (answer?.answer_text?.toLowerCase() === opt.option_text?.toLowerCase());
                                                const isOptionCorrect = opt.is_correct;

                                                return (
                                                    <div key={opt.option_id} className={cn(
                                                        "p-3.5 sm:p-5 rounded-xl border-2 transition-all",
                                                        isSelected && isOptionCorrect && "border-green-500 dark:border-green-600 bg-green-100 dark:bg-green-900/40 shadow-md",
                                                        isSelected && !isOptionCorrect && "border-red-500 dark:border-red-600 bg-red-100 dark:bg-red-900/40 shadow-md",
                                                        !isSelected && isOptionCorrect && "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30",
                                                        !isSelected && !isOptionCorrect && "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30"
                                                    )}>
                                                        <div className="flex items-start sm:items-center justify-between gap-2">
                                                            <span className={cn(
                                                                "font-bold text-sm sm:text-base",
                                                                isSelected && isOptionCorrect && "text-green-900 dark:text-green-100",
                                                                isSelected && !isOptionCorrect && "text-red-900 dark:text-red-100",
                                                                !isSelected && isOptionCorrect && "text-green-800 dark:text-green-200",
                                                                !isSelected && !isOptionCorrect && "text-gray-600 dark:text-gray-400"
                                                            )}>{opt.option_text}</span>
                                                            {(isSelected || isOptionCorrect) && (
                                                                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                                                    {isSelected && (
                                                                        <Badge
                                                                            className={cn(
                                                                                "rounded-md font-bold text-[10px] sm:text-xs",
                                                                                isOptionCorrect
                                                                                    ? "bg-blue-600 dark:bg-blue-500 text-white"
                                                                                    : "bg-red-600 dark:bg-red-500 text-white"
                                                                            )}
                                                                        >
                                                                            Your Choice
                                                                        </Badge>
                                                                    )}
                                                                    {isOptionCorrect && (
                                                                        <Badge className="bg-green-600 dark:bg-green-500 text-white rounded-md font-bold text-[10px] sm:text-xs">
                                                                            Correct
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* True/False Questions */}
                                    {question.question_type === 'true_false' && (
                                        <div className="grid gap-2.5 sm:gap-3">
                                            {question.question_options?.map((opt: any) => {
                                                const isSelected = answer?.answer_text === opt.option_id.toString()
                                                    || (answer?.answer_text?.toLowerCase() === opt.option_text?.toLowerCase());
                                                const isOptionCorrect = opt.is_correct;

                                                return (
                                                    <div key={opt.option_id} className={cn(
                                                        "p-3.5 sm:p-5 rounded-xl border-2 transition-all",
                                                        isSelected && isOptionCorrect && "border-green-500 dark:border-green-600 bg-green-100 dark:bg-green-900/40 shadow-md",
                                                        isSelected && !isOptionCorrect && "border-red-500 dark:border-red-600 bg-red-100 dark:bg-red-900/40 shadow-md",
                                                        !isSelected && isOptionCorrect && "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30",
                                                        !isSelected && !isOptionCorrect && "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30"
                                                    )}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className={cn(
                                                                "font-bold text-base sm:text-lg",
                                                                isSelected && isOptionCorrect && "text-green-900 dark:text-green-100",
                                                                isSelected && !isOptionCorrect && "text-red-900 dark:text-red-100",
                                                                !isSelected && isOptionCorrect && "text-green-800 dark:text-green-200",
                                                                !isSelected && !isOptionCorrect && "text-gray-600 dark:text-gray-400"
                                                            )}>{opt.option_text}</span>
                                                            {(isSelected || isOptionCorrect) && (
                                                                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                                                    {isSelected && (
                                                                        <Badge
                                                                            className={cn(
                                                                                "rounded-md font-bold text-[10px] sm:text-xs",
                                                                                isOptionCorrect
                                                                                    ? "bg-blue-600 dark:bg-blue-500 text-white"
                                                                                    : "bg-red-600 dark:bg-red-500 text-white"
                                                                            )}
                                                                        >
                                                                            Your Choice
                                                                        </Badge>
                                                                    )}
                                                                    {isOptionCorrect && (
                                                                        <Badge className="bg-green-600 dark:bg-green-500 text-white rounded-md font-bold text-[10px] sm:text-xs">
                                                                            Correct
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Free Text Questions */}
                                    {question.question_type === 'free_text' && (() => {
                                        const questionScore = questionScoresByQuestionId[question.question_id];
                                        const isPendingReview = !questionScore?.ai_feedback || questionScore?.ai_confidence === 0;
                                        const hasTeacherOverride = questionScore?.is_overridden;

                                        return (
                                            <div className="space-y-3">
                                                <div className={cn(
                                                    "p-3.5 sm:p-5 rounded-xl border-2",
                                                    isPendingReview
                                                        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                                                        : isCorrect
                                                            ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                                                            : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                                                )}>
                                                    <p className="text-xs font-bold uppercase text-gray-600 dark:text-gray-400 mb-2">YOUR SUBMISSION</p>
                                                    <p className="font-medium text-gray-900 dark:text-gray-100 text-base leading-relaxed">
                                                        {answer?.answer_text || "No answer provided."}
                                                    </p>
                                                </div>

                                                {/* Score breakdown for free text */}
                                                {questionScore && !isPendingReview && (
                                                    <div className="flex items-center gap-3 px-2">
                                                        <Badge variant="secondary" className="font-bold">
                                                            {questionScore.points_earned}/{questionScore.points_possible} pts
                                                        </Badge>
                                                        {hasTeacherOverride && (
                                                            <Badge className="bg-blue-600 text-white font-bold gap-1">
                                                                <IconUserCheck size={14} />
                                                                Teacher reviewed
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}

                                                {isPendingReview && (
                                                    <div className="bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 dark:border-amber-600 p-3.5 sm:p-5 rounded-r-xl">
                                                        <div className="flex items-center gap-2 font-bold mb-2 text-amber-900 dark:text-amber-300">
                                                            <IconHourglass size={20} />
                                                            <span>Pending Review</span>
                                                        </div>
                                                        <p className="text-amber-800 dark:text-amber-200 text-sm leading-relaxed">
                                                            This free-text answer is awaiting evaluation. Your teacher will review it, or it will be evaluated by AI.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Per-question AI/Teacher feedback */}
                                    {(() => {
                                        const questionScore = questionScoresByQuestionId[question.question_id];
                                        const feedbackText = questionScore?.is_overridden
                                            ? questionScore?.teacher_notes
                                            : (questionScore?.ai_feedback || answer?.feedback);
                                        const feedbackSource = questionScore?.is_overridden ? 'Teacher' : 'AI';

                                        if (!feedbackText || (question.question_type === 'free_text' && questionScore?.ai_confidence === 0)) return null;

                                        return (
                                            <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-600 dark:border-blue-500 p-3.5 sm:p-5 rounded-r-xl">
                                                <div className="flex items-center gap-2 font-bold mb-2 text-blue-900 dark:text-blue-300">
                                                    {feedbackSource === 'Teacher' ? <IconUserCheck size={20} /> : <IconMessageChatbot size={20} />}
                                                    <span>{feedbackSource} Feedback</span>
                                                </div>
                                                <p className="text-blue-900 dark:text-blue-200 text-base leading-relaxed">{feedbackText}</p>
                                            </div>
                                        );
                                    })()}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Footer Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 pt-6 sm:pt-10">
                <Link href={`/dashboard/student/courses/${courseId}/exams`}>
                    <Button variant="outline" size="lg" className="w-full sm:w-auto rounded-2xl gap-2 font-bold py-5 sm:py-6 px-6 sm:px-8">
                        <IconArrowLeft size={18} />
                        View All Assessments
                    </Button>
                </Link>
                <Link href={`/dashboard/student/courses/${courseId}`}>
                    <Button size="lg" className="w-full sm:w-auto rounded-2xl font-bold py-5 sm:py-6 px-6 sm:px-8 bg-primary hover:shadow-xl hover:shadow-primary/20">
                        Continue Learning
                    </Button>
                </Link>
            </div>
        </div>
    )
}
