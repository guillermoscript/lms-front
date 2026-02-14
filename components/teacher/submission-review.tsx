'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconCheck,
  IconX,
  IconPencil,
  IconLoader2,
  IconRobot,
  IconUser,
  IconHourglass,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface QuestionData {
  question_id: number
  question_text: string
  question_type: string
  points_possible: number
  ai_grading_criteria: string | null
  expected_keywords: string[] | null
  options: { option_id: number; option_text: string; is_correct: boolean }[]
  answer_text: string
  answer_is_correct: boolean | null
  answer_feedback: string | null
  score_id: number | null
  points_earned: number | null
  is_correct: boolean | null
  ai_feedback: string
  ai_confidence: number | null
  teacher_notes: string
  is_overridden: boolean
}

interface SubmissionData {
  submission_id: number
  exam_id: number
  student_id: string
  student_name: string
  submission_date: string
  score: number | null
  review_status: string
  ai_data: any
  ai_model_used: string | null
  overall_feedback: string
  teacher_notes: string
  questions: QuestionData[]
}

interface SubmissionReviewProps {
  submission: SubmissionData
  onSave: (overrides: {
    score: number
    feedback: string
    teacher_notes: string
    question_overrides: {
      question_id: number
      points_earned: number
      is_correct: boolean
      teacher_notes: string
    }[]
  }) => Promise<void>
}

export function SubmissionReview({ submission, onSave }: SubmissionReviewProps) {
  // Initialize question overrides from existing data
  const [questionOverrides, setQuestionOverrides] = useState<
    Record<number, { points_earned: number; is_correct: boolean; teacher_notes: string }>
  >(() => {
    const initial: Record<number, { points_earned: number; is_correct: boolean; teacher_notes: string }> = {}
    for (const q of submission.questions) {
      initial[q.question_id] = {
        points_earned: q.points_earned ?? 0,
        is_correct: q.is_correct ?? false,
        teacher_notes: q.teacher_notes || '',
      }
    }
    return initial
  })

  const [overallFeedback, setOverallFeedback] = useState(submission.overall_feedback)
  const [teacherNotes, setTeacherNotes] = useState(submission.teacher_notes)
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Calculate total score from question overrides
  const totalPointsPossible = submission.questions.reduce((sum, q) => sum + q.points_possible, 0)
  const totalPointsEarned = Object.values(questionOverrides).reduce((sum, q) => sum + q.points_earned, 0)
  const calculatedScore = totalPointsPossible > 0 ? (totalPointsEarned / totalPointsPossible) * 100 : 0

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        score: calculatedScore,
        feedback: overallFeedback,
        teacher_notes: teacherNotes,
        question_overrides: Object.entries(questionOverrides).map(([qid, override]) => ({
          question_id: parseInt(qid),
          ...override,
        })),
      })
    } finally {
      setSaving(false)
    }
  }

  const updateQuestionOverride = (questionId: number, updates: Partial<{ points_earned: number; is_correct: boolean; teacher_notes: string }>) => {
    setQuestionOverrides(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        ...updates,
      },
    }))
  }

  const getStatusBadge = () => {
    switch (submission.review_status) {
      case 'pending_teacher_review':
        return <Badge className="bg-amber-500 text-white"><IconHourglass className="mr-1 h-3 w-3" />Awaiting Review</Badge>
      case 'ai_reviewed':
        return <Badge className="bg-blue-500 text-white"><IconRobot className="mr-1 h-3 w-3" />AI Reviewed</Badge>
      case 'teacher_reviewed':
        return <Badge className="bg-green-600 text-white"><IconUser className="mr-1 h-3 w-3" />Teacher Reviewed</Badge>
      default:
        return <Badge variant="secondary"><IconHourglass className="mr-1 h-3 w-3" />Pending</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Review Submission</h1>
          {getStatusBadge()}
        </div>
        <p className="text-muted-foreground">
          Student: <span className="font-medium text-foreground">{submission.student_name}</span>
          {submission.submission_date && (
            <> &middot; Submitted {format(new Date(submission.submission_date), 'PPp')}</>
          )}
          {submission.ai_model_used && (
            <> &middot; Graded by <span className="font-medium">{submission.ai_model_used}</span></>
          )}
        </p>
      </div>

      {/* Score Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Overall Score</span>
            <span className="text-3xl font-black">
              {Math.round(calculatedScore)}%
            </span>
          </CardTitle>
          <CardDescription>
            {totalPointsEarned}/{totalPointsPossible} points &middot; Score auto-calculates from question scores below
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Overall Feedback (visible to student)</Label>
            <Textarea
              value={overallFeedback}
              onChange={(e) => setOverallFeedback(e.target.value)}
              rows={3}
              placeholder="Provide overall feedback on the student's performance..."
            />
          </div>

          <div>
            <Label>Teacher Notes (private, not shown to student)</Label>
            <Textarea
              value={teacherNotes}
              onChange={(e) => setTeacherNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Questions ({submission.questions.length})</h2>

        {submission.questions.map((q, idx) => {
          const override = questionOverrides[q.question_id]
          const isEditing = editingQuestion === q.question_id
          const isFreeText = q.question_type === 'free_text'
          const isPendingReview = isFreeText && q.ai_confidence === 0

          return (
            <Card key={q.question_id} className={cn(
              "border-2",
              isPendingReview && "border-amber-300 dark:border-amber-700",
              !isPendingReview && override?.is_correct && "border-green-200 dark:border-green-800",
              !isPendingReview && !override?.is_correct && "border-red-200 dark:border-red-800",
            )}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                        Question {idx + 1}
                      </span>
                      <Badge variant="secondary" className="text-xs">{q.question_type.replace('_', ' ')}</Badge>
                      {q.is_overridden && (
                        <Badge variant="outline" className="text-xs border-purple-300">
                          <IconUser className="mr-1 h-3 w-3" />
                          Overridden
                        </Badge>
                      )}
                      {isPendingReview && (
                        <Badge className="bg-amber-500 text-white text-xs">
                          <IconHourglass className="mr-1 h-3 w-3" />
                          Needs Grading
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-lg font-bold">{q.question_text}</h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-black">
                      {override?.points_earned ?? 0}/{q.points_possible}
                    </div>
                    <span className="text-xs text-muted-foreground">points</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Show correct answer for MC/TF */}
                {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && (
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const isSelected = q.answer_text === opt.option_id.toString()
                      return (
                        <div key={opt.option_id} className={cn(
                          "p-3 rounded-lg border flex items-center justify-between text-sm",
                          isSelected && opt.is_correct && "bg-green-50 dark:bg-green-950/30 border-green-300",
                          isSelected && !opt.is_correct && "bg-red-50 dark:bg-red-950/30 border-red-300",
                          !isSelected && opt.is_correct && "bg-green-50/50 dark:bg-green-950/20 border-green-200",
                          !isSelected && !opt.is_correct && "bg-muted/30 border-muted",
                        )}>
                          <span className="font-medium">{opt.option_text}</span>
                          <div className="flex items-center gap-2">
                            {isSelected && <Badge variant="outline" className="text-xs">Selected</Badge>}
                            {opt.is_correct && <Badge className="bg-green-600 text-white text-xs">Correct</Badge>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Free text answer */}
                {isFreeText && (
                  <div>
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Student Answer</Label>
                    <div className="mt-1 p-4 bg-muted rounded-lg text-sm leading-relaxed">
                      {q.answer_text || <span className="italic text-muted-foreground">No answer provided</span>}
                    </div>
                    {q.ai_grading_criteria && (
                      <p className="text-xs text-muted-foreground mt-2">
                        <span className="font-bold">Grading criteria:</span> {q.ai_grading_criteria}
                      </p>
                    )}
                    {q.expected_keywords && q.expected_keywords.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-bold">Expected keywords:</span> {q.expected_keywords.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                {/* AI Feedback */}
                {q.ai_feedback && q.ai_confidence !== 0 && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <IconRobot className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-bold text-blue-900 dark:text-blue-300">AI Feedback</span>
                      {q.ai_confidence != null && (
                        <Badge variant="secondary" className="text-xs">
                          {(q.ai_confidence * 100).toFixed(0)}% confidence
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-blue-900 dark:text-blue-200">{q.ai_feedback}</p>
                  </div>
                )}

                {/* Teacher Override Section */}
                {isEditing ? (
                  <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-4 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <IconPencil className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-bold text-purple-900 dark:text-purple-300">Teacher Override</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label>Points Earned</Label>
                        <Input
                          type="number"
                          min="0"
                          max={q.points_possible}
                          step="0.5"
                          value={override?.points_earned ?? 0}
                          onChange={(e) => {
                            const pts = parseFloat(e.target.value) || 0
                            updateQuestionOverride(q.question_id, {
                              points_earned: Math.min(pts, q.points_possible),
                              is_correct: pts >= q.points_possible * 0.5,
                            })
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground pt-6">/ {q.points_possible}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <Label>Mark as:</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant={override?.is_correct ? 'default' : 'outline'}
                        className={cn(override?.is_correct && "bg-green-600 hover:bg-green-700")}
                        onClick={() => updateQuestionOverride(q.question_id, { is_correct: true })}
                      >
                        <IconCheck className="mr-1 h-4 w-4" /> Correct
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={!override?.is_correct ? 'default' : 'outline'}
                        className={cn(!override?.is_correct && "bg-red-600 hover:bg-red-700")}
                        onClick={() => updateQuestionOverride(q.question_id, { is_correct: false })}
                      >
                        <IconX className="mr-1 h-4 w-4" /> Incorrect
                      </Button>
                    </div>

                    <div>
                      <Label>Teacher Notes</Label>
                      <Textarea
                        value={override?.teacher_notes || ''}
                        onChange={(e) => updateQuestionOverride(q.question_id, { teacher_notes: e.target.value })}
                        rows={2}
                        placeholder="Explain your grading decision..."
                      />
                    </div>

                    <Button size="sm" onClick={() => setEditingQuestion(null)}>
                      Done
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {override?.teacher_notes && (
                      <div className="flex-1 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 rounded-lg">
                        <div className="flex items-center gap-1 mb-1">
                          <IconUser className="h-3 w-3 text-purple-600" />
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300">Teacher Notes</span>
                        </div>
                        <p className="text-sm">{override.teacher_notes}</p>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingQuestion(q.question_id)}
                      className="shrink-0"
                    >
                      <IconPencil className="h-4 w-4 mr-1" />
                      {isFreeText && isPendingReview ? 'Grade' : 'Override'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4 pb-8 sticky bottom-0 bg-background/80 backdrop-blur-sm border-t p-4 -mx-4">
        <div className="flex items-center gap-4 mr-auto">
          <span className="text-sm text-muted-foreground">
            Final Score: <span className="text-2xl font-black text-foreground">{Math.round(calculatedScore)}%</span>
          </span>
        </div>
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <IconLoader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <IconCheck className="h-4 w-4 mr-2" />
              Save & Finalize Review
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
