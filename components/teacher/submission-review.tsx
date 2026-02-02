'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconCheck, IconX, IconPencil, IconLoader2 } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface SubmissionReviewProps {
  submission: any
  onSave: (overrides: any) => Promise<void>
}

export function SubmissionReview({ submission, onSave }: SubmissionReviewProps) {
  const [overrideScore, setOverrideScore] = useState(submission.score?.[0]?.score || 0)
  const [overrideFeedback, setOverrideFeedback] = useState(submission.score?.[0]?.feedback || '')
  const [teacherNotes, setTeacherNotes] = useState(submission.score?.[0]?.teacher_notes || '')
  const [questionOverrides, setQuestionOverrides] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        score: overrideScore,
        feedback: overrideFeedback,
        teacher_notes: teacherNotes,
        question_overrides: questionOverrides,
      })
    } finally {
      setSaving(false)
    }
  }

  const toggleQuestionCorrectness = (answer: any) => {
    const newOverrides = [...questionOverrides]
    const existingIndex = newOverrides.findIndex(o => o.question_id === answer.question_id)

    if (existingIndex >= 0) {
      newOverrides[existingIndex].is_correct = !newOverrides[existingIndex].is_correct
    } else {
      newOverrides.push({
        question_id: answer.question_id,
        is_correct: !answer.is_correct,
        feedback: answer.feedback
      })
    }

    setQuestionOverrides(newOverrides)
  }

  const getQuestionStatus = (answer: any) => {
    const override = questionOverrides.find(o => o.question_id === answer.question_id)
    return override ? override.is_correct : answer.is_correct
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Overall Score & Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Score (0-100)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={overrideScore}
              onChange={(e) => setOverrideScore(parseFloat(e.target.value))}
            />
          </div>

          <div>
            <Label>Overall Feedback</Label>
            <Textarea
              value={overrideFeedback}
              onChange={(e) => setOverrideFeedback(e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <Label>Teacher Notes (Private)</Label>
            <Textarea
              value={teacherNotes}
              onChange={(e) => setTeacherNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes (not shown to student)"
            />
          </div>
        </CardContent>
      </Card>

      {submission.answers?.map((answer: any, idx: number) => {
        const isCorrect = getQuestionStatus(answer)

        return (
          <Card key={answer.answer_id}>
            <CardHeader>
              <CardTitle className="text-lg">Question {idx + 1}</CardTitle>
              <p className="text-sm text-muted-foreground">{answer.question?.question_text}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Student Answer</Label>
                <div className="bg-muted p-4 rounded-lg">
                  {answer.answer_text}
                </div>
              </div>

              {answer.feedback && (
                <div>
                  <Label>AI Feedback</Label>
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    {answer.feedback}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  isCorrect ? "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100" : "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100"
                )}>
                  {isCorrect ? <IconCheck className="h-4 w-4" /> : <IconX className="h-4 w-4" />}
                  {isCorrect ? 'Correct' : 'Incorrect'}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleQuestionCorrectness(answer)}
                >
                  <IconPencil className="h-4 w-4 mr-1" />
                  Override
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <div className="flex justify-end gap-3">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <IconLoader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Review'
          )}
        </Button>
      </div>
    </div>
  )
}
