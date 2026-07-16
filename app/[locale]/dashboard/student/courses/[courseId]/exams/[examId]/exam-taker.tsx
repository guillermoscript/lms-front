'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useEventListener } from 'usehooks-ts'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  IconClock,
  IconLoader2,
  IconChevronLeft,
  IconChevronRight,
  IconSend,
  IconFileText,
  IconMessageChatbot,
  IconCheck
} from '@tabler/icons-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface Question {
  id: number
  text: string
  type: 'multiple_choice' | 'true_false' | 'free_text'
  options: { id: number; text: string }[]
}

interface ExamTakerProps {
  examId: number
  courseId: number
  title: string
  description: string | null
  duration: number | null
  questions: Question[]
  tenantId: string
}

export function ExamTaker({
  examId,
  courseId,
  title,
  duration,
  questions,
  tenantId,
}: ExamTakerProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(duration ? duration * 60 : null) // in seconds
  const router = useRouter()
  const supabase = createClient()

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Warn before leaving (refresh/close tab) with unsubmitted answers
  useEventListener('beforeunload', (e) => {
    if (Object.keys(answers).length === 0 || submitting) return
    e.preventDefault()
    e.returnValue = ''
  })

  const currentQuestion = questions[currentQuestionIndex]
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const answeredCount = Object.keys(answers).length
  const progressPercent = (answeredCount / questions.length) * 100

  const handleAnswerChange = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user

      if (!user) {
        router.push('/auth/login')
        return
      }

      // Create exam submission
      const { data: submission, error: submissionError } = await supabase
        .from('exam_submissions')
        .insert({
          exam_id: examId,
          student_id: user.id,
          tenant_id: tenantId,
        })
        .select('submission_id')
        .single()

      if (submissionError || !submission) {
        console.error('Failed to create submission:', submissionError)
        setSubmitting(false)
        return
      }

      // Insert answers
      const answerRecords = questions.map((q) => ({
        submission_id: submission.submission_id,
        question_id: q.id,
        answer_text: answers[q.id] || '',
      }))

      const { error: answersError } = await supabase
        .from('exam_answers')
        .insert(answerRecords)

      if (answersError) {
        console.error('Failed to save answers:', answersError)
        setSubmitting(false)
        return
      }

      // Trigger AI grading
      try {
        const { gradeExamWithAI } = await import('@/app/actions/exam-grading')
        const gradingResult = await gradeExamWithAI({
          examId,
          submissionId: submission.submission_id,
          answers,
        })
        if (!gradingResult.success) {
          console.error('AI grading returned error:', gradingResult.error)
        }
      } catch (gradingError) {
        console.error('AI grading failed (non-blocking):', gradingError)
        // Continue to results page even if AI grading fails
      }

      // Redirect to result page
      router.push(`/dashboard/student/courses/${courseId}/exams/${examId}/result`)
    } catch (error) {
      console.error('Submission error:', error)
      setSubmitting(false)
    }
  }

  // Timer effect (declared after handleSubmit so the auto-submit reference is valid)
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer)
          handleSubmit() // Auto-submit when time runs out
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft])

  if (questions.length === 0) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="rounded-xl border bg-card p-8 sm:p-12">
          <IconFileText className="mx-auto mb-5 h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-2xl font-bold mb-2">No Questions Found</h2>
          <p className="text-muted-foreground mb-8 text-lg">This exam doesn&apos;t have any questions yet. Please check back later.</p>
          <Link href={`/dashboard/student/courses/${courseId}/exams`}>
            <Button variant="outline" className="h-11 gap-2 rounded-xl px-6 font-semibold">
              <IconChevronLeft className="mr-2 h-5 w-5" />
              Return to Assessments
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-muted/20 py-4 sm:py-6">
      <div className="container flex max-w-5xl flex-1 flex-col gap-5 px-3 sm:gap-6 sm:px-4">
        {/* Top bar with stats and timer */}
        <div className="sticky top-3 z-20 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-3 rounded-xl border bg-card/95 px-3 py-3 shadow-sm backdrop-blur-sm sm:gap-4 sm:px-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconFileText size={20} />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h1 className="line-clamp-1 font-semibold tracking-tight">{title}</h1>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">
                  Progress: {answeredCount}/{questions.length}
                </span>
                <Progress value={progressPercent} className="h-1.5 max-w-28 flex-1" />
              </div>
            </div>
          </div>

          {timeLeft !== null && (
            <div className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm",
              timeLeft < 300 ? "border-destructive bg-destructive text-destructive-foreground" : "border-border bg-card text-foreground"
            )}>
              <IconClock className={cn("h-5 w-5", timeLeft < 300 ? "text-destructive-foreground" : "text-muted-foreground")} />
              <div className="flex flex-col -space-y-1">
                <span className="text-[10px] font-semibold tracking-wide opacity-80">Time left</span>
                <span className="font-mono text-xl font-bold tabular-nums">{formatTime(timeLeft)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Question Area */}
        <div className="flex flex-1 flex-col">
          <Card className="flex flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
            <div className="h-2 w-full flex">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 transition-colors duration-200 motion-reduce:transition-none",
                    i === currentQuestionIndex ? "bg-primary" : i < currentQuestionIndex ? "bg-primary/30" : "bg-muted"
                  )}
                />
              ))}
            </div>

            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center p-5 sm:p-8 md:p-12">
              <div className="w-full space-y-7">
                <div className="text-sm font-semibold text-primary">
                  Question {currentQuestionIndex + 1}
                </div>

                <h2 className="max-w-[28ch] text-xl font-semibold leading-snug tracking-tight text-pretty sm:text-2xl md:text-3xl">
                  {currentQuestion.text}
                </h2>

                <div className="space-y-3 pt-1">
                  {currentQuestion.type === 'multiple_choice' && (
                    <RadioGroup
                      value={answers[currentQuestion.id] || ''}
                      onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                      className="grid gap-3"
                    >
                      {currentQuestion.options.map((option) => (
                        <Label
                          key={option.id}
                          htmlFor={`option-${option.id}`}
                          className={cn(
                            "flex min-h-14 items-center gap-3 rounded-xl border p-4 text-base font-medium transition-colors focus-within:ring-2 focus-within:ring-ring sm:gap-4 sm:p-5",
                            answers[currentQuestion.id] === option.id.toString()
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          )}
                        >
                          <RadioGroupItem
                            value={option.id.toString()}
                            id={`option-${option.id}`}
                            className="h-6 w-6 border-2"
                          />
                          <span className="text-lg font-bold">{option.text}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  )}

                  {currentQuestion.type === 'true_false' && (
                    <RadioGroup
                      value={answers[currentQuestion.id] || ''}
                      onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                      className="grid grid-cols-2 gap-4"
                    >
                      {['true', 'false'].map((val) => (
                        <Label
                          key={val}
                          htmlFor={val}
                          className={cn(
                            "flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border p-5 transition-colors focus-within:ring-2 focus-within:ring-ring sm:p-8",
                            answers[currentQuestion.id] === val
                              ? "border-primary bg-primary/5"
                              : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
                          )}
                        >
                          <RadioGroupItem value={val} id={val} className="sr-only" />
                          <span className="text-xl font-semibold capitalize">{val}</span>
                          <div className={cn(
                            "h-8 w-8 rounded-full border-2 flex items-center justify-center",
                            answers[currentQuestion.id] === val ? "bg-primary border-primary text-white" : "border-muted-foreground/20"
                          )}>
                            {answers[currentQuestion.id] === val && <IconCheck size={20} stroke={4} />}
                          </div>
                        </Label>
                      ))}
                    </RadioGroup>
                  )}

                  {currentQuestion.type === 'free_text' && (
                    <div className="space-y-2">
                      <Textarea
                        value={answers[currentQuestion.id] || ''}
                        onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                        placeholder="Share your knowledge here..."
                        className="min-h-[240px] rounded-xl border p-4 text-base leading-relaxed focus-visible:ring-primary sm:p-5"
                      />
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 justify-end px-2">
                        <IconMessageChatbot size={14} />
                        AI will evaluate your reasoning
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between gap-3 border-t pt-4 sm:gap-4">
          <Button
            variant="ghost"
            size="lg"
            className="h-12 gap-2 rounded-xl px-3 font-semibold text-muted-foreground hover:text-foreground sm:px-5"
            onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
            disabled={currentQuestionIndex === 0}
          >
            <IconChevronLeft size={20} stroke={3} />
            Previous
          </Button>

          <div className="flex gap-4">
            {isLastQuestion ? (
              <Button
                size="lg"
                data-testid="exam-finish-submit"
                className="h-12 gap-2 rounded-xl bg-green-600 px-4 font-semibold hover:bg-green-700 sm:px-6"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <IconLoader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <IconSend size={20} stroke={3} />
                )}
                Finish & Submit
              </Button>
            ) : (
              <Button
                size="lg"
                className="h-12 gap-2 rounded-xl px-4 font-semibold sm:px-6"
                onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
              >
                Next Question
                <IconChevronRight size={20} stroke={3} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
