import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTrophy, IconCheck, IconX, IconClock, IconMessageChatbot, IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface PageProps {
    params: Promise<{ courseId: string; examId: string }>
}

export default async function ExamResultPage({ params }: PageProps) {
    const { courseId, examId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

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
          )
        )
    `)
        .eq('exam_id', parseInt(examId))
        .eq('exam_submissions.student_id', user.id)
        .single()

    if (error || !examData) {
        console.error('Error fetching exam data:', error)
        notFound()
    }

    const submission = examData.exam_submissions?.[0]
    if (!submission) {
        redirect(`/dashboard/student/courses/${courseId}/exams/${examId}`)
    }

    const score = submission.exam_scores?.[0]?.score
    const aiData = submission.ai_data as any
    const answersByQuestionId = (submission.exam_answers || []).reduce(
        (acc: any, answer: any) => {
            acc[answer.question_id] = answer
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
        <div className="container mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-500">
            <BreadcrumbComponent links={breadcrumbLinks} />

            {/* Score Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 md:p-12 text-white shadow-2xl shadow-indigo-200">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <IconTrophy size={180} stroke={1} />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="space-y-4 text-center md:text-left">
                        <Badge variant="outline" className="text-white border-white/30 bg-white/10 px-3 py-1">
                            Exam Completed
                        </Badge>
                        <h1 className="text-4xl md:text-5xl font-black">{examData.title}</h1>
                        <p className="text-indigo-100 max-w-lg">{examData.description}</p>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 pt-4">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-white/10">
                                    <IconClock size={20} />
                                </div>
                                <span className="text-sm font-medium">Completed on {new Date(submission.submission_date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white text-indigo-950 rounded-2xl p-8 flex flex-col items-center justify-center shadow-xl min-w-[200px]">
                        <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1">Final Score</span>
                        <div className="text-6xl font-black mb-2">{Math.round(score || 0)}%</div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-4">
                            <div
                                className="h-full bg-indigo-600 transition-all duration-1000"
                                style={{ width: `${score || 0}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Analysis Section */}
            {aiData && (
                <Card className="border-none shadow-soft overflow-hidden bg-indigo-50/50">
                    <CardHeader className="bg-indigo-600 p-4 text-white">
                        <div className="flex items-center gap-2">
                            <IconMessageChatbot size={24} />
                            <CardTitle className="text-lg">AI Performance Analysis</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="prose prose-indigo max-w-none">
                            <p className="text-indigo-900 leading-relaxed font-medium">
                                {aiData.summary || "Your performance has been evaluated. Review the detailed feedback per question below."}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Detailed Review */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold px-2">Detailed Question Review</h2>
                <div className="space-y-4">
                    {examData.exam_questions?.map((question: any, idx: number) => {
                        const answer = answersByQuestionId[question.question_id];
                        const isCorrect = answer?.is_correct;

                        return (
                            <Card key={question.question_id} className={cn(
                                "border-2 transition-all duration-300",
                                isCorrect ? "border-green-100" : "border-red-100"
                            )}>
                                <CardHeader className="pb-3 border-b border-muted/5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">
                                                Question {idx + 1}
                                                <Badge variant="secondary" className="lowercase font-medium">{question.question_type}</Badge>
                                            </div>
                                            <h3 className="text-xl font-bold">{question.question_text}</h3>
                                        </div>
                                        <div className={cn(
                                            "p-2 rounded-xl",
                                            isCorrect ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                                        )}>
                                            {isCorrect ? <IconCheck size={28} /> : <IconX size={28} />}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-6 space-y-4">
                                    {/* Multiple Choice Options */}
                                    {question.question_type === 'multiple_choice' && (
                                        <div className="grid gap-2">
                                            {question.question_options?.map((opt: any) => {
                                                const isSelected = answer?.answer_text === opt.option_id.toString();
                                                const isOptionCorrect = opt.is_correct;

                                                return (
                                                    <div key={opt.option_id} className={cn(
                                                        "p-4 rounded-xl border-2 flex items-center justify-between transition-all",
                                                        isSelected && isOptionCorrect && "border-green-500 bg-green-50 shadow-sm",
                                                        isSelected && !isOptionCorrect && "border-red-500 bg-red-50",
                                                        !isSelected && isOptionCorrect && "border-green-200 bg-green-50/50 opacity-70",
                                                        !isSelected && !isOptionCorrect && "border-border opacity-50"
                                                    )}>
                                                        <span className="font-medium">{opt.option_text}</span>
                                                        <div className="flex items-center gap-2">
                                                            {isSelected && <Badge variant={isOptionCorrect ? 'default' : 'destructive'} className="rounded-md">Your Choice</Badge>}
                                                            {isOptionCorrect && <Badge className="bg-green-500 rounded-md">Correct Answer</Badge>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Free Text and True/False Logic similar fallback */}
                                    {question.question_type !== 'multiple_choice' && (
                                        <div className="space-y-3">
                                            <div className="p-4 rounded-xl bg-muted/50 border">
                                                <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Your Submission</p>
                                                <p className="font-medium">{answer?.answer_text || "No answer provided."}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Per-question logic feedback */}
                                    {answer?.feedback && (
                                        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-xl">
                                            <div className="flex items-center gap-2 font-bold mb-1 text-amber-900">
                                                <IconMessageChatbot size={18} />
                                                AI Recommendation
                                            </div>
                                            <p className="text-amber-800 text-sm">{answer.feedback}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-center gap-4 pt-10">
                <Link href={`/dashboard/student/courses/${courseId}/exams`}>
                    <Button variant="outline" size="lg" className="rounded-2xl gap-2 font-bold py-6 px-8">
                        <IconArrowLeft size={20} />
                        View All Assessments
                    </Button>
                </Link>
                <Link href={`/dashboard/student/courses/${courseId}`}>
                    <Button size="lg" className="rounded-2xl font-bold py-6 px-8 bg-primary hover:shadow-xl hover:shadow-primary/20">
                        Continue Learning
                    </Button>
                </Link>
            </div>
        </div>
    )
}
