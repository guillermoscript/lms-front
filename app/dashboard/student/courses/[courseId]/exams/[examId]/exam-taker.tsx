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
  IconArrowRight,
  IconClock,
  IconLoader2,
  IconSend,
} from '@tabler/icons-react'

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
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const allQuestionsAnswered = questions.every((q) => answers[q.id])

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

      // Redirect to review page
      router.push(`/dashboard/student/courses/${courseId}/exams/${examId}/review`)
    } catch (error) {
      console.error('Submission error:', error)
      setSubmitting(false)
    }
  }

  if (questions.length === 0) {
    return (
      <div className="container mx-auto max-w-2xl py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">This exam has no questions yet.</p>
            <Link href={`/dashboard/student/courses/${courseId}/exams`}>
              <Button variant="outline" className="mt-4">
                <IconArrowLeft className="mr-2 h-4 w-4" />
                Back to Exams
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 px-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {timeLeft !== null && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2">
            <IconClock className="h-4 w-4 text-muted-foreground" />
            <span className={`font-mono ${timeLeft < 60 ? 'text-destructive' : ''}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
      </div>

      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
          <span>
            {Object.keys(answers).length} of {questions.length} answered
          </span>
        </div>
        <div className="flex gap-1">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setCurrentQuestionIndex(i)}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i === currentQuestionIndex
                  ? 'bg-primary'
                  : answers[q.id]
                  ? 'bg-primary/40'
                  : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Question Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">
            {currentQuestionIndex + 1}. {currentQuestion.text}
          </CardTitle>
          <CardDescription>
            {currentQuestion.type === 'multiple_choice' && 'Select one option'}
            {currentQuestion.type === 'true_false' && 'Select True or False'}
            {currentQuestion.type === 'free_text' && 'Write your answer'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentQuestion.type === 'multiple_choice' && (
            <RadioGroup
              value={answers[currentQuestion.id] || ''}
              onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
            >
              {currentQuestion.options.map((option) => (
                <div key={option.id} className="flex items-center space-x-3 py-2">
                  <RadioGroupItem
                    value={option.id.toString()}
                    id={`option-${option.id}`}
                  />
                  <Label htmlFor={`option-${option.id}`} className="flex-1 cursor-pointer">
                    {option.text}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {currentQuestion.type === 'true_false' && (
            <RadioGroup
              value={answers[currentQuestion.id] || ''}
              onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
            >
              <div className="flex items-center space-x-3 py-2">
                <RadioGroupItem value="true" id="true" />
                <Label htmlFor="true" className="cursor-pointer">True</Label>
              </div>
              <div className="flex items-center space-x-3 py-2">
                <RadioGroupItem value="false" id="false" />
                <Label htmlFor="false" className="cursor-pointer">False</Label>
              </div>
            </RadioGroup>
          )}

          {currentQuestion.type === 'free_text' && (
            <Textarea
              value={answers[currentQuestion.id] || ''}
              onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
              placeholder="Type your answer here..."
              rows={5}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
          disabled={currentQuestionIndex === 0}
        >
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>

        {isLastQuestion ? (
          <Button
            onClick={handleSubmit}
            disabled={submitting || !allQuestionsAnswered}
          >
            {submitting ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconSend className="mr-2 h-4 w-4" />
            )}
            Submit Exam
          </Button>
        ) : (
          <Button onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}>
            Next
            <IconArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Submit anyway button if not all answered */}
      {isLastQuestion && !allQuestionsAnswered && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Answer all questions to submit the exam.
        </p>
      )}
    </div>
  )
}
