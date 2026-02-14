'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  IconLoader2,
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconEye,
} from '@tabler/icons-react'
import { VersionHistorySheet } from './version-history-sheet'

interface Question {
  id: string
  text: string
  type: 'multiple_choice' | 'true_false' | 'free_text'
  options: { id: string; text: string; is_correct: boolean }[]
  points?: number
  grading_rubric?: string
  ai_grading_criteria?: string
  expected_keywords?: string[]
}

interface ExamBuilderProps {
  courseId: number
  courseTitle: string
  initialSequence: number
  initialData?: {
    exam_id: number
    title: string
    description: string | null
    duration: number | null
    sequence: number
    status: 'draft' | 'published' | 'archived'
    questions: Question[]
  }
}

export function ExamBuilder({
  courseId,
  courseTitle,
  initialSequence,
  initialData,
}: ExamBuilderProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    duration: initialData?.duration?.toString() || '',
    sequence: initialData?.sequence || initialSequence,
  })

  const [questions, setQuestions] = useState<Question[]>(
    initialData?.questions || []
  )

  const addQuestion = (type: Question['type']) => {
    const newQuestion: Question = {
      id: `temp-${Date.now()}`,
      text: '',
      type,
      options:
        type === 'multiple_choice'
          ? [
              { id: `opt-1`, text: '', is_correct: false },
              { id: `opt-2`, text: '', is_correct: false },
            ]
          : [],
      points: 10, // Default points
      grading_rubric: '',
      ai_grading_criteria: '',
      expected_keywords: [],
    }
    setQuestions([...questions, newQuestion])
  }

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...updates } : q)))
  }

  const deleteQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id))
  }

  const addOption = (questionId: string) => {
    setQuestions(
      questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: [
                ...q.options,
                {
                  id: `opt-${Date.now()}`,
                  text: '',
                  is_correct: false,
                },
              ],
            }
          : q
      )
    )
  }

  const updateOption = (
    questionId: string,
    optionId: string,
    updates: Partial<Question['options'][0]>
  ) => {
    setQuestions(
      questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((opt) =>
                opt.id === optionId ? { ...opt, ...updates } : opt
              ),
            }
          : q
      )
    )
  }

  const deleteOption = (questionId: string, optionId: string) => {
    setQuestions(
      questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.filter((opt) => opt.id !== optionId),
            }
          : q
      )
    )
  }

  const handleSave = async (publish: boolean) => {
    setLoading(true)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      const examData = {
        course_id: courseId,
        title: formData.title,
        description: formData.description || null,
        duration: formData.duration ? parseInt(formData.duration) : null,
        sequence: formData.sequence,
        status: publish ? ('published' as const) : ('draft' as const),
        created_by: user.id,
      }

      let examId: number

      if (initialData) {
        // Update existing exam
        const { error: updateError } = await supabase
          .from('exams')
          .update(examData)
          .eq('exam_id', initialData.exam_id)

        if (updateError) throw updateError
        examId = initialData.exam_id

        // Delete existing questions
        await supabase
          .from('exam_questions')
          .delete()
          .eq('exam_id', initialData.exam_id)
      } else {
        // Create new exam
        const { data: exam, error: insertError } = await supabase
          .from('exams')
          .insert([examData])
          .select('exam_id')
          .single()

        if (insertError) throw insertError
        examId = exam.exam_id
      }

      // Insert questions
      for (const question of questions) {
        const { data: insertedQuestion, error: questionError } = await supabase
          .from('exam_questions')
          .insert({
            exam_id: examId,
            question_text: question.text,
            question_type: question.type,
            points: question.points || 10,
            grading_rubric: question.grading_rubric || null,
            ai_grading_criteria: question.ai_grading_criteria || null,
            expected_keywords: question.expected_keywords || null,
          })
          .select('question_id')
          .single()

        if (questionError) throw questionError

        // Insert options for multiple choice
        if (question.type === 'multiple_choice' && question.options.length > 0) {
          const optionsData = question.options.map((opt) => ({
            question_id: insertedQuestion.question_id,
            option_text: opt.text,
            is_correct: opt.is_correct,
          }))

          const { error: optionsError } = await supabase
            .from('question_options')
            .insert(optionsData)

          if (optionsError) throw optionsError
        }
      }

      router.push(`/dashboard/teacher/courses/${courseId}`)
    } catch (err: any) {
      console.error('Error saving exam:', err)
      setError(err.message || 'Failed to save exam')
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/dashboard/teacher/courses/${courseId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            Back to {courseTitle}
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {initialData ? 'Edit Exam' : 'Create New Exam'}
          </h1>
          {initialData && (
            <VersionHistorySheet
              contentType="exam"
              contentId={initialData.exam_id}
              currentSnapshot={{ ...formData, questions }}
              onRestore={() => router.refresh()}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Exam Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Exam Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              Exam Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Midterm Exam"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What topics does this exam cover?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="0"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="60"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for no time limit
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sequence">
                Exam Order <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sequence"
                type="number"
                min="1"
                value={formData.sequence}
                onChange={(e) =>
                  setFormData({ ...formData, sequence: parseInt(e.target.value) })
                }
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Questions</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addQuestion('multiple_choice')}
            >
              <IconPlus className="mr-2 h-4 w-4" />
              Multiple Choice
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addQuestion('true_false')}
            >
              <IconPlus className="mr-2 h-4 w-4" />
              True/False
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addQuestion('free_text')}
            >
              <IconPlus className="mr-2 h-4 w-4" />
              Free Text
            </Button>
          </div>
        </div>

        {questions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No questions added yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Click one of the buttons above to add a question
              </p>
            </CardContent>
          </Card>
        ) : (
          questions.map((question, index) => (
            <Card key={question.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">Question {index + 1}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {question.type === 'multiple_choice' && 'Multiple Choice'}
                      {question.type === 'true_false' && 'True/False'}
                      {question.type === 'free_text' && 'Free Text (AI Graded)'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteQuestion(question.id)}
                  >
                    <IconTrash className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Question Text</Label>
                  <Textarea
                    value={question.text}
                    onChange={(e) => updateQuestion(question.id, { text: e.target.value })}
                    placeholder="Enter your question here..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Points</Label>
                  <Input
                    type="number"
                    min="1"
                    value={question.points || 10}
                    onChange={(e) =>
                      updateQuestion(question.id, { points: parseInt(e.target.value) || 10 })
                    }
                    placeholder="10"
                    className="w-32"
                  />
                </div>

                {question.type === 'multiple_choice' && (
                  <div className="space-y-3">
                    <Label>Answer Options</Label>
                    {question.options.map((option, optIndex) => (
                      <div key={option.id} className="flex items-center gap-3">
                        <Input
                          value={option.text}
                          onChange={(e) =>
                            updateOption(question.id, option.id, { text: e.target.value })
                          }
                          placeholder={`Option ${optIndex + 1}`}
                          className="flex-1"
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={option.is_correct}
                            onChange={(e) =>
                              updateOption(question.id, option.id, {
                                is_correct: e.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                          Correct
                        </label>
                        {question.options.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteOption(question.id, option.id)}
                          >
                            <IconTrash className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addOption(question.id)}
                    >
                      <IconPlus className="mr-2 h-4 w-4" />
                      Add Option
                    </Button>
                  </div>
                )}

                {question.type === 'true_false' && (
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <p className="text-sm text-muted-foreground">
                      Students will choose between True and False
                    </p>
                  </div>
                )}

                {question.type === 'free_text' && (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 p-4">
                      <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                        This question will be graded automatically by AI. Configure grading criteria below.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Grading Rubric (Optional)</Label>
                      <Textarea
                        value={question.grading_rubric || ''}
                        onChange={(e) =>
                          updateQuestion(question.id, { grading_rubric: e.target.value })
                        }
                        placeholder="Describe what makes a complete answer..."
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        General guidelines for grading this answer
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>AI Grading Criteria (Optional)</Label>
                      <Textarea
                        value={question.ai_grading_criteria || ''}
                        onChange={(e) =>
                          updateQuestion(question.id, { ai_grading_criteria: e.target.value })
                        }
                        placeholder="Check for specific concepts or reasoning..."
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Specific criteria for AI to evaluate
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Expected Keywords (Optional)</Label>
                      <Input
                        value={(question.expected_keywords || []).join(', ')}
                        onChange={(e) =>
                          updateQuestion(question.id, {
                            expected_keywords: e.target.value
                              .split(',')
                              .map((k) => k.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="keyword1, keyword2, keyword3"
                      />
                      <p className="text-xs text-muted-foreground">
                        Comma-separated list of key terms expected in the answer
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => handleSave(false)}
          disabled={loading || !formData.title || questions.length === 0}
        >
          {loading ? (
            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
          )}
          Save as Draft
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={() => handleSave(true)}
          disabled={loading || !formData.title || questions.length === 0}
        >
          {loading ? (
            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <IconEye className="mr-2 h-4 w-4" />
          )}
          Publish Exam
        </Button>
      </div>
    </div>
  )
}
