import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  IconArrowLeft,
  IconCheck,
  IconX,
  IconClock,
  IconTrophy,
} from '@tabler/icons-react'

interface PageProps {
  params: Promise<{ courseId: string; examId: string }>
}

export default async function ExamReviewPage({ params }: PageProps) {
  const { courseId, examId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get exam details
  const { data: exam } = await supabase
    .from('exams')
    .select('exam_id, title, description')
    .eq('exam_id', parseInt(examId))
    .eq('course_id', parseInt(courseId))
    .single()

  if (!exam) {
    notFound()
  }

  // Get submission
  const { data: submission } = await supabase
    .from('exam_submissions')
    .select(`
      submission_id,
      submission_date,
      ai_data
    `)
    .eq('exam_id', parseInt(examId))
    .eq('student_id', user.id)
    .single()

  if (!submission) {
    redirect(`/dashboard/student/courses/${courseId}/exams/${examId}`)
  }

  // Get score
  const { data: score } = await supabase
    .from('exam_scores')
    .select('score, feedback')
    .eq('submission_id', submission.submission_id)
    .single()

  // Get questions with answers
  const { data: questions } = await supabase
    .from('exam_questions')
    .select(`
      question_id,
      question_text,
      question_type,
      question_options (
        option_id,
        option_text,
        is_correct
      )
    `)
    .eq('exam_id', parseInt(examId))
    .order('question_id', { ascending: true })

  // Get user's answers
  const { data: answers } = await supabase
    .from('exam_answers')
    .select('question_id, answer_text, is_correct, feedback')
    .eq('submission_id', submission.submission_id)

  const answersMap = new Map(answers?.map(a => [a.question_id, a]) || [])

  // Calculate stats
  const totalQuestions = questions?.length || 0
  const correctAnswers = answers?.filter(a => a.is_correct).length || 0

  // Parse AI data if exists
  const aiData = submission.ai_data as Record<string, unknown> | null

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Link href={`/dashboard/student/courses/${courseId}/exams`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            Back to Exams
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{exam.title}</h1>
        <p className="text-muted-foreground">Exam Results</p>
      </div>

      {/* Score Card */}
      <Card className="mb-8">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="mb-2 flex items-center justify-center">
                <IconTrophy className="h-8 w-8 text-primary" />
              </div>
              <div className="text-4xl font-bold">
                {score ? `${Number(score.score).toFixed(0)}%` : 'Pending'}
              </div>
              <p className="text-sm text-muted-foreground">Overall Score</p>
            </div>
            <div className="h-16 w-px bg-border" />
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">
                {correctAnswers}/{totalQuestions}
              </div>
              <p className="text-sm text-muted-foreground">Correct Answers</p>
            </div>
            <div className="h-16 w-px bg-border" />
            <div className="text-center">
              <div className="flex items-center text-sm text-muted-foreground">
                <IconClock className="mr-1 h-4 w-4" />
                Submitted
              </div>
              <p className="text-sm">
                {new Date(submission.submission_date).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Overall AI Feedback */}
          {score?.feedback && (
            <div className="mt-6 border-t pt-6">
              <h3 className="mb-2 font-semibold">Overall Feedback</h3>
              <p className="text-muted-foreground">{score.feedback}</p>
            </div>
          )}

          {/* AI Data Summary */}
          {aiData && aiData.summary && (
            <div className="mt-6 border-t pt-6">
              <h3 className="mb-2 font-semibold">AI Analysis</h3>
              <p className="text-muted-foreground">{String(aiData.summary)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Questions Review */}
      <h2 className="mb-4 text-lg font-semibold">Question Review</h2>
      <div className="space-y-4">
        {questions?.map((question, index) => {
          const answer = answersMap.get(question.question_id)
          const isCorrect = answer?.is_correct

          return (
            <Card key={question.question_id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">
                    {index + 1}. {question.question_text}
                  </CardTitle>
                  {isCorrect !== null && isCorrect !== undefined && (
                    <Badge variant={isCorrect ? 'default' : 'destructive'}>
                      {isCorrect ? (
                        <><IconCheck className="mr-1 h-3 w-3" /> Correct</>
                      ) : (
                        <><IconX className="mr-1 h-3 w-3" /> Incorrect</>
                      )}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {question.question_type === 'multiple_choice' && 'Multiple Choice'}
                  {question.question_type === 'true_false' && 'True/False'}
                  {question.question_type === 'free_text' && 'Free Text'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Show options for multiple choice */}
                {question.question_type === 'multiple_choice' && (
                  <div className="space-y-2">
                    {question.question_options?.map((option) => {
                      const isSelected = answer?.answer_text === option.option_id.toString()
                      const isOptionCorrect = option.is_correct

                      return (
                        <div
                          key={option.option_id}
                          className={`rounded-lg border p-3 ${
                            isSelected && isOptionCorrect
                              ? 'border-green-500 bg-green-50 dark:bg-green-950'
                              : isSelected && !isOptionCorrect
                              ? 'border-red-500 bg-red-50 dark:bg-red-950'
                              : isOptionCorrect
                              ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/50'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{option.option_text}</span>
                            <div className="flex items-center gap-2">
                              {isSelected && (
                                <Badge variant="outline" className="text-xs">
                                  Your answer
                                </Badge>
                              )}
                              {isOptionCorrect && (
                                <Badge className="bg-green-500 text-xs">
                                  Correct
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Show True/False answer */}
                {question.question_type === 'true_false' && (
                  <div className="space-y-2">
                    <p>
                      <span className="text-muted-foreground">Your answer: </span>
                      <span className="font-medium">
                        {answer?.answer_text === 'true' ? 'True' : 'False'}
                      </span>
                    </p>
                  </div>
                )}

                {/* Show free text answer */}
                {question.question_type === 'free_text' && (
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <p className="text-sm text-muted-foreground mb-1">Your answer:</p>
                    <p>{answer?.answer_text || 'No answer provided'}</p>
                  </div>
                )}

                {/* AI Feedback for this question */}
                {answer?.feedback && (
                  <div className="mt-4 rounded-lg border-l-4 border-primary bg-primary/5 p-3">
                    <p className="text-sm font-medium text-primary mb-1">AI Feedback</p>
                    <p className="text-sm text-muted-foreground">{answer.feedback}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Action buttons */}
      <div className="mt-8 flex justify-center gap-4">
        <Link href={`/dashboard/student/courses/${courseId}`}>
          <Button variant="outline">Back to Course</Button>
        </Link>
        <Link href={`/dashboard/student/courses/${courseId}/exams`}>
          <Button>View Other Exams</Button>
        </Link>
      </div>
    </div>
  )
}
