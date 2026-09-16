import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTrophy, IconCheck, IconX, IconClock, IconMessageChatbot, IconArrowLeft, IconUserCheck, IconHourglass, IconCertificate } from '@tabler/icons-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import { requireCourseAccess } from '@/lib/services/course-access-guard'
import { getFormatter, getTranslations } from 'next-intl/server'
import { describeExamFeedback, parseExamFeedback } from '@/lib/exams/feedback-codes'

type ExamQuestionTypeKey = `questionType.${'multiple_choice' | 'true_false' | 'free_text'}`

interface PageProps {
    params: Promise<{ courseId: string; examId: string }>
}

export default async function ExamResultPage({ params }: PageProps) {
    const { courseId, examId } = await params
    const supabase = createAdminClient()
    const [t, tFeedback, format] = await Promise.all([
        getTranslations('examResult'),
        getTranslations('examResult.feedback'),
        getFormatter(),
    ])

    const userId = await getCurrentUserId()
    if (!userId) redirect('/auth/login')

    // Entitlement gate (#509). Own-submission scoping below already blocks other
    // students' work; this is what makes a tenant access cutoff apply here too.
    await requireCourseAccess(supabase, userId, parseInt(courseId))

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
          correct_answer,
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
                    if (selectedOpt !== null) {
                        acc[q.question_id] = !!selectedOpt?.is_correct
                    }
                    // If no matching option found, leave undefined — let ?? fall through to qScore
                }
            }
            return acc
        },
        {}
    )

    const firstExam = examData;
    const courseData = firstExam?.courses;
    const courseTitle = (Array.isArray(courseData) ? courseData[0]?.title : (courseData as any)?.title) || t('courseFallback');

    const breadcrumbLinks = [
        { href: '/dashboard/student', label: t('breadcrumb.dashboard') },
        { href: `/dashboard/student/courses/${courseId}`, label: courseTitle },
        { href: `/dashboard/student/courses/${courseId}/exams`, label: t('breadcrumb.exams') },
        { href: '#', label: t('breadcrumb.results') },
    ]

    // The deterministic grading branches store a status code, not prose
    // (#725). A code is already conveyed by the review banner above the
    // card — and after a teacher review "pending" would be stale — so the AI
    // card only renders what the model actually wrote.
    const overallFeedback = aiData?.overall_feedback || aiData?.summary
    const overallIsStatusCode = parseExamFeedback(overallFeedback) !== null
    const showAiAnalysis = !!aiData && !overallIsStatusCode

    // Correct option per question, so a stored `incorrect` code can name it.
    // A true/false question can define its answer either as a flagged option or
    // in its own `correct_answer` column; the grader accepts both, so naming the
    // right answer has to as well, or such a question shows a bare "Incorrect."
    const correctAnswerByQuestionId = (examData.exam_questions || []).reduce(
        (acc: Record<number, string | undefined>, q: {
            question_id: number
            correct_answer?: string | null
            question_options?: { is_correct?: boolean; option_text?: string }[]
        }) => {
            acc[q.question_id] =
                q.question_options?.find((opt) => opt.is_correct)?.option_text
                ?? q.correct_answer
                ?? undefined
            return acc
        },
        {} as Record<number, string | undefined>
    )

    return (
        <div className="container mx-auto py-5 sm:py-8 px-4 space-y-5 sm:space-y-8 animate-in fade-in duration-500">
            <BreadcrumbComponent links={breadcrumbLinks} />

            {/* Score Header */}
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-primary p-5 sm:p-8 md:p-12 text-primary-foreground shadow-2xl">
                <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-10">
                    <IconTrophy className="h-24 w-24 sm:h-[180px] sm:w-[180px]" stroke={1} />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-8">
                    <div className="space-y-3 sm:space-y-4 text-center md:text-left">
                        <Badge variant="outline" className="text-primary-foreground border-primary-foreground/30 bg-primary-foreground/10 px-3 py-1">
                            {t('completed')}
                        </Badge>
                        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black">{examData.title}</h1>
                        <p className="text-primary-foreground max-w-lg text-sm sm:text-base">{examData.description}</p>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 sm:gap-6 pt-2 sm:pt-4">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 sm:p-2 rounded-lg bg-primary-foreground/10">
                                    <IconClock size={18} />
                                </div>
                                <span className="text-xs sm:text-sm font-medium">{t('completedOn', { date: format.dateTime(new Date(submission.submission_date), { dateStyle: 'long' }) })}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-card text-card-foreground rounded-2xl p-5 sm:p-8 flex flex-col items-center justify-center shadow-xl w-full md:w-auto md:min-w-[200px]">
                        <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1">{t('finalScore')}</span>
                        {/* Ungraded shows as ungraded, not as 0% (PRODUCT.md principle 5). */}
                        {score == null ? (
                            <>
                                <div className="text-5xl sm:text-6xl font-black mb-2" aria-label={t('notGradedYet')}>—</div>
                                <span className="text-xs sm:text-sm font-medium text-muted-foreground">{t('notGradedYet')}</span>
                            </>
                        ) : (
                            <div className="text-5xl sm:text-6xl font-black mb-2">{Math.round(score)}%</div>
                        )}
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-3 sm:mt-4">
                            <div
                                className="h-full bg-primary transition-all duration-1000"
                                style={{ width: `${score ?? 0}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Review Status Banner */}
            {reviewStatus === 'pending_teacher_review' && (
                <Card className="border-2 border-warning/30 shadow-lg overflow-hidden bg-warning/10">
                    <CardContent className="p-4 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 bg-warning/15 rounded-xl text-warning shrink-0">
                            <IconHourglass className="h-5 w-5 sm:h-7 sm:w-7" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-warning">{t('pendingReview.title')}</h3>
                            <p className="text-warning text-sm">
                                {t('pendingReview.description')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {reviewStatus === 'ai_reviewed' && (
                <Card className="border-2 border-success/30 shadow-lg overflow-hidden bg-success/10">
                    <CardContent className="p-4 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 bg-success/15 rounded-xl text-success shrink-0">
                            <IconMessageChatbot className="h-5 w-5 sm:h-7 sm:w-7" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-success">{t('aiReviewed.title')}</h3>
                            <p className="text-success text-sm">
                                {t('aiReviewed.description')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {reviewStatus === 'teacher_reviewed' && (
                <Card className="border-2 border-primary/25 shadow-lg overflow-hidden bg-brand-tint">
                    <CardContent className="p-4 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 bg-brand-tint rounded-xl text-brand-text shrink-0">
                            <IconUserCheck className="h-5 w-5 sm:h-7 sm:w-7" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-brand-text">{t('teacherReviewed.title')}</h3>
                            <p className="text-brand-text text-sm">
                                {t('teacherReviewed.description')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Certificate Banner */}
            {certificate && (
                <Card className="border-2 border-success/30 shadow-lg overflow-hidden bg-success/10">
                    <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 bg-success/15 rounded-xl text-success shrink-0">
                            <IconCertificate className="h-5 w-5 sm:h-7 sm:w-7" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-lg text-success">{t('certificate.title')}</h3>
                            <p className="text-success text-sm">
                                {t('certificate.description')}
                            </p>
                        </div>
                        <Link href={`/verify/${certificate.verification_code}`}>
                            <Button variant="outline" className="border-success/30 text-success hover:bg-success/10 font-bold gap-2 whitespace-nowrap">
                                <IconCertificate className="h-4 w-4" />
                                {t('certificate.view')}
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            {/* AI Analysis Section */}
            {showAiAnalysis && (
                <Card className="border-2 border-primary/25 shadow-lg overflow-hidden bg-brand-tint">
                    <CardHeader className="bg-primary p-4 sm:p-6 text-primary-foreground">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-foreground/20 rounded-lg shrink-0">
                                <IconMessageChatbot className="h-5 w-5 sm:h-7 sm:w-7" />
                            </div>
                            <CardTitle className="text-base sm:text-xl font-bold">{t('aiAnalysis.title')}</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                        <div className="prose prose-lg dark:prose-invert max-w-none">
                            <p className="text-foreground leading-relaxed font-medium text-base">
                                {overallFeedback || t('aiAnalysis.fallback')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Detailed Review */}
            <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold px-1 sm:px-2">{t('detailedReview')}</h2>
                <div className="space-y-4">
                    {examData.exam_questions?.map((question: any, idx: number) => {
                        const answer = answersByQuestionId[question.question_id];
                        const qScore = questionScoresByQuestionId[question.question_id];
                        // For MC/TF, derive correctness from the options (ground truth);
                        // for free_text, fall back to scored/answer fields
                        const isCorrect = (question.question_type === 'multiple_choice' || question.question_type === 'true_false')
                            ? correctOptionsByQuestion[question.question_id] ?? qScore?.is_correct ?? answer?.is_correct
                            : qScore?.is_correct ?? answer?.is_correct;
                        // A teacher override is a grade: the parked row keeps its
                        // ai_confidence = 0 / "Pending teacher review." text, so
                        // is_overridden must win or the student keeps seeing
                        // "Pending Review" after the teacher graded it (#674).
                        const isFreeTextPending = question.question_type === 'free_text'
                            && !qScore?.is_overridden
                            && (!qScore?.ai_feedback || qScore?.ai_confidence === 0);

                        return (
                            <Card key={question.question_id} className={cn(
                                "border-2 transition-all duration-300",
                                isFreeTextPending
                                    ? "border-warning/40 bg-card"
                                    : isCorrect
                                        ? "border-success/40 bg-card"
                                        : "border-destructive/40 bg-card"
                            )}>
                                <CardHeader className="pb-3 border-b border-muted/10 px-4 sm:px-6">
                                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-widest">
                                                {t('question', { number: idx + 1 })}
                                                <Badge variant="secondary" className="lowercase font-medium text-[10px] sm:text-xs">{t(`questionType.${question.question_type}` as ExamQuestionTypeKey)}</Badge>
                                            </div>
                                            <h3 className="text-base sm:text-xl font-bold">{question.question_text}</h3>
                                        </div>
                                        <div className={cn(
                                            "p-1.5 sm:p-2 rounded-xl shrink-0",
                                            isFreeTextPending
                                                ? "bg-warning/15 text-warning"
                                                : isCorrect
                                                    ? "bg-success/15 text-success"
                                                    : "bg-destructive/15 text-destructive"
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
                                                        isSelected && isOptionCorrect && "border-success bg-success/15 shadow-md",
                                                        isSelected && !isOptionCorrect && "border-destructive bg-destructive/15 shadow-md",
                                                        !isSelected && isOptionCorrect && "border-success/40 bg-success/10",
                                                        !isSelected && !isOptionCorrect && "border-border bg-muted"
                                                    )}>
                                                        <div className="flex items-start sm:items-center justify-between gap-2">
                                                            <span className={cn(
                                                                "font-bold text-sm sm:text-base",
                                                                isSelected && isOptionCorrect && "text-success",
                                                                isSelected && !isOptionCorrect && "text-destructive",
                                                                !isSelected && isOptionCorrect && "text-success",
                                                                !isSelected && !isOptionCorrect && "text-muted-foreground"
                                                            )}>{opt.option_text}</span>
                                                            {(isSelected || isOptionCorrect) && (
                                                                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                                                    {isSelected && (
                                                                        <Badge
                                                                            className={cn(
                                                                                "rounded-md font-bold text-[10px] sm:text-xs",
                                                                                isOptionCorrect
                                                                                    ? "bg-success text-success-foreground"
                                                                                    : "bg-destructive text-destructive-foreground"
                                                                            )}
                                                                        >
                                                                            {t('yourChoice')}
                                                                        </Badge>
                                                                    )}
                                                                    {isOptionCorrect && (
                                                                        <Badge className="bg-success text-success-foreground rounded-md font-bold text-[10px] sm:text-xs">
                                                                            {t('correct')}
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
                                                        isSelected && isOptionCorrect && "border-success bg-success/15 shadow-md",
                                                        isSelected && !isOptionCorrect && "border-destructive bg-destructive/15 shadow-md",
                                                        !isSelected && isOptionCorrect && "border-success/40 bg-success/10",
                                                        !isSelected && !isOptionCorrect && "border-border bg-muted"
                                                    )}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className={cn(
                                                                "font-bold text-base sm:text-lg",
                                                                isSelected && isOptionCorrect && "text-success",
                                                                isSelected && !isOptionCorrect && "text-destructive",
                                                                !isSelected && isOptionCorrect && "text-success",
                                                                !isSelected && !isOptionCorrect && "text-muted-foreground"
                                                            )}>{opt.option_text}</span>
                                                            {(isSelected || isOptionCorrect) && (
                                                                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                                                    {isSelected && (
                                                                        <Badge
                                                                            className={cn(
                                                                                "rounded-md font-bold text-[10px] sm:text-xs",
                                                                                isOptionCorrect
                                                                                    ? "bg-success text-success-foreground"
                                                                                    : "bg-destructive text-destructive-foreground"
                                                                            )}
                                                                        >
                                                                            {t('yourChoice')}
                                                                        </Badge>
                                                                    )}
                                                                    {isOptionCorrect && (
                                                                        <Badge className="bg-success text-success-foreground rounded-md font-bold text-[10px] sm:text-xs">
                                                                            {t('correct')}
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
                                        const hasTeacherOverride = !!questionScore?.is_overridden;
                                        const isPendingReview = !hasTeacherOverride
                                            && (!questionScore?.ai_feedback || questionScore?.ai_confidence === 0);

                                        return (
                                            <div className="space-y-3">
                                                <div className={cn(
                                                    "p-3.5 sm:p-5 rounded-xl border-2",
                                                    isPendingReview
                                                        ? "bg-warning/10 border-warning/30"
                                                        : isCorrect
                                                            ? "bg-success/10 border-success/30"
                                                            : "bg-brand-tint border-primary/25"
                                                )}>
                                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-2">{t('yourSubmission')}</p>
                                                    <p className="font-medium text-foreground text-base leading-relaxed">
                                                        {answer?.answer_text || t('noAnswer')}
                                                    </p>
                                                </div>

                                                {/* Score breakdown for free text */}
                                                {questionScore && !isPendingReview && (
                                                    <div className="flex items-center gap-3 px-2">
                                                        <Badge variant="secondary" className="font-bold">
                                                            {t('points', { earned: questionScore.points_earned, possible: questionScore.points_possible })}
                                                        </Badge>
                                                        {hasTeacherOverride && (
                                                            <Badge className="bg-primary text-primary-foreground font-bold gap-1">
                                                                <IconUserCheck size={14} />
                                                                {t('teacherReviewedBadge')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}

                                                {isPendingReview && (
                                                    <div className="bg-warning/10 border-l-4 border-warning p-3.5 sm:p-5 rounded-r-xl">
                                                        <div className="flex items-center gap-2 font-bold mb-2 text-warning">
                                                            <IconHourglass size={20} />
                                                            <span>{t('questionPending.title')}</span>
                                                        </div>
                                                        <p className="text-warning text-sm leading-relaxed">
                                                            {t('questionPending.description')}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Per-question AI/Teacher feedback */}
                                    {(() => {
                                        const questionScore = questionScoresByQuestionId[question.question_id];
                                        const isTeacherFeedback = !!questionScore?.is_overridden;
                                        // Stored codes (and the legacy English sentences) are
                                        // translated here; real AI prose passes through.
                                        const feedbackText = isTeacherFeedback
                                            ? questionScore?.teacher_notes
                                            : describeExamFeedback(
                                                questionScore?.ai_feedback || answer?.feedback,
                                                tFeedback,
                                                { correctAnswer: correctAnswerByQuestionId[question.question_id] },
                                            );

                                        const stillPending = question.question_type === 'free_text'
                                            && !questionScore?.is_overridden
                                            && questionScore?.ai_confidence === 0;
                                        if (!feedbackText || stillPending) return null;

                                        return (
                                            <div className="bg-brand-tint border-l-4 border-primary p-3.5 sm:p-5 rounded-r-xl">
                                                <div className="flex items-center gap-2 font-bold mb-2 text-brand-text">
                                                    {isTeacherFeedback ? <IconUserCheck size={20} /> : <IconMessageChatbot size={20} />}
                                                    <span>{isTeacherFeedback ? t('teacherFeedback') : t('aiFeedback')}</span>
                                                </div>
                                                <p className="text-brand-text text-base leading-relaxed">{feedbackText}</p>
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
                    <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2 font-bold py-5 sm:py-6 px-6 sm:px-8">
                        <IconArrowLeft size={18} />
                        {t('viewAllAssessments')}
                    </Button>
                </Link>
                <Link href={`/dashboard/student/courses/${courseId}`}>
                    <Button size="lg" className="w-full sm:w-auto font-bold py-5 sm:py-6 px-6 sm:px-8 bg-primary hover:shadow-xl hover:shadow-primary/20">
                        {t('continueLearning')}
                    </Button>
                </Link>
            </div>
        </div>
    )
}
