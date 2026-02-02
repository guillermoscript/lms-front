'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  IconArrowLeft,
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
}

export function ExamTaker({
  examId,
  courseId,
  title,
  description,
  duration,
  questions,
}: ExamTakerProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(duration ? duration * 60 : null) // in seconds
  const router = useRouter()
  const supabase = createClient()

  // Timer effect
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const currentQuestion = questions[currentQuestionIndex]
  const isFirstQuestion = currentQuestionIndex === 0
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const answeredCount = Object.keys(answers).length
  const progressPercent = (answeredCount / questions.length) * 100

  const handleAnswerChange = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

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

      // Redirect to result page
      router.push(`/dashboard/student/courses/${courseId}/exams/${examId}/result`)
    } catch (error) {
      console.error('Submission error:', error)
      setSubmitting(false)
    }
  }

  if (questions.length === 0) {
    return (
      <div className="container mx-auto max-w-2xl py-20 px-4 text-center">
        <div className="bg-card border rounded-3xl p-12 shadow-soft">
          <IconFileText className="mx-auto mb-6 h-16 w-16 text-muted-foreground/30" />
          <h2 className="text-2xl font-bold mb-2">No Questions Found</h2>
          <p className="text-muted-foreground mb-8 text-lg">This exam doesn't have any questions yet. Please check back later.</p>
          <Link href={`/dashboard/student/courses/${courseId}/exams`}>
            <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold">
              <IconChevronLeft className="mr-2 h-5 w-5" />
              Return to Assessments
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col pt-6 pb-12">
      <div className="container max-w-4xl flex-1 flex flex-col gap-8">
        {/* Top bar with stats and timer */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-4 z-20">
          <div className="bg-background/80 backdrop-blur-md border border-muted-foreground/10 rounded-2xl p-4 flex flex-1 items-center gap-6 shadow-xl">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <IconFileText size={20} />
            </div>
            <div className="flex-1 space-y-1">
              <h1 className="font-bold tracking-tight line-clamp-1">{title}</h1>
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  Progress: {answeredCount}/{questions.length}
                </span>
                <Progress value={progressPercent} className="h-1.5 w-24" />
              </div>
            </div>
          </div>

          {timeLeft !== null && (
            <div className={cn(
              "p-4 rounded-2xl flex items-center gap-3 shadow-xl border animate-pulse-subtle",
              timeLeft < 300 ? "bg-red-500 text-white border-red-400" : "bg-card text-foreground border-muted-foreground/10"
            )}>
              <IconClock className={cn("h-5 w-5", timeLeft < 300 ? "text-white" : "text-muted-foreground")} />
              <div className="flex flex-col -space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Time Left</span>
                <span className="font-mono text-xl font-black">{formatTime(timeLeft)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Question Area */}
        <div className="flex-1 flex flex-col gap-8">
          <Card className="border-none shadow-soft rounded-[32px] overflow-hidden flex-1 flex flex-col">
            <div className="h-2 w-full flex">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 transition-all duration-500",
                    i === currentQuestionIndex ? "bg-primary" : i < currentQuestionIndex ? "bg-primary/30" : "bg-muted"
                  )}
                />
              ))}
            </div>

            <div className="flex-1 p-8 md:p-12 flex flex-col items-center justify-center max-w-3xl mx-auto w-full">
              <div className="w-full space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 text-primary font-black uppercase tracking-[0.2em] text-sm">
                  <span className="h-[1px] w-8 bg-current opacity-20" />
                  Question {currentQuestionIndex + 1}
                </div>

                <h2 className="text-2xl md:text-3xl font-black leading-tight text-center md:text-left">
                  {currentQuestion.text}
                </h2>

                <div className="space-y-4 pt-4">
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
                            "flex items-center gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all hover:border-primary/50",
                            answers[currentQuestion.id] === option.id.toString()
                              ? "border-primary bg-primary/5 shadow-inner"
                              : "border-muted-foreground/5 hover:bg-muted/30"
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
                            "flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 cursor-pointer transition-all",
                            answers[currentQuestion.id] === val
                              ? "border-primary bg-primary/5 shadow-xl"
                              : "border-muted-foreground/5 bg-background hover:bg-muted/30"
                          )}
                        >
                          <RadioGroupItem value={val} id={val} className="sr-only" />
                          <span className="text-2xl font-black capitalize">{val}</span>
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
                        className="min-h-[250px] p-6 text-lg rounded-3xl border-2 border-muted-foreground/10 focus-visible:ring-primary focus-visible:border-primary shadow-inner"
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
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            size="lg"
            className="rounded-2xl h-14 px-8 font-bold gap-2 text-muted-foreground hover:text-foreground"
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
                className="rounded-2xl h-14 px-10 font-bold bg-green-600 hover:bg-green-700 hover:shadow-xl hover:shadow-green-500/20 gap-2 transition-all"
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
                className="rounded-2xl h-14 px-10 font-bold bg-primary hover:shadow-xl hover:shadow-primary/20 gap-2 transition-all"
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

