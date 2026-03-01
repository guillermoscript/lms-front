'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  IconCheck,
  IconX,
  IconRobot,
  IconUser,
  IconMessage,
  IconAlertTriangle,
  IconCircleCheck,
  IconLoader2,
  IconHourglass,
  IconPencil,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface SubmissionReviewProps {
  submission: any
  questions?: any[]
  answers?: any[]
  onSave?: (overrides: any) => Promise<void>
}

export function SubmissionReview({
  submission: initialSubmission,
  questions,
  answers,
  onSave,
}: SubmissionReviewProps) {
  const t = useTranslations('dashboard.teacher.submissionReview')
  const supabase = createClient()
  const [submission, setSubmission] = useState(initialSubmission)
  const [loading, setLoading] = useState(false)
  const [teacherFeedback, setTeacherFeedback] = useState(
    submission.teacher_feedback || ''
  )
  const initialAnswers = answers || []
  const [overrides, setOverrides] = useState<Record<number, any>>(
    initialAnswers.reduce((acc, ans) => {
      acc[ans.question_id] = {
        points_earned: ans.teacher_score_override !== null ? ans.teacher_score_override : ans.points_earned,
        is_correct: ans.is_correct,
        teacher_notes: ans.teacher_notes || '',
        is_overridden: ans.teacher_score_override !== null,
      }
      return acc
    }, {} as Record<number, any>)
  )

  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null)

  const handleSaveReview = async () => {
    setLoading(true)
    try {
      // Update submission status and feedback
      const { error: subError } = await supabase
        .from('exam_submissions')
        .update({
          teacher_feedback: teacherFeedback,
          status: 'teacher_reviewed',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submission.id)

      if (subError) throw subError

      // Update question overrides
      for (const [questionId, data] of Object.entries(overrides)) {
        const { error: ansError } = await supabase
          .from('exam_answers')
          .update({
            teacher_score_override: data.is_overridden ? data.points_earned : null,
            is_correct: data.is_correct,
            teacher_notes: data.teacher_notes,
            manual_grading_status: 'graded',
          })
          .eq('submission_id', submission.id)
          .eq('question_id', parseInt(questionId))

        if (ansError) throw ansError
      }

      // Refresh data
      const { data: updatedSub } = await supabase
        .from('exam_submissions')
        .select('*')
        .eq('id', submission.id)
        .single()

      if (updatedSub) setSubmission(updatedSub)
      setEditingQuestionId(null)

      // invoke optional callback for parent pages
      if (typeof onSave === 'function') {
        try {
          await onSave(overrides)
        } catch (e) {
          // ignore
        }
      }
    } catch (err) {
      console.error('Error saving review:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateQuestionOverride = (questionId: number, updates: any) => {
    setOverrides({
      ...overrides,
      [questionId]: {
        ...overrides[questionId],
        ...updates,
        is_overridden: true
      }
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">{t('status.pending')}</Badge>
      case 'ai_reviewed':
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100/80">
            {t('status.aiReviewed')}
          </Badge>
        )
      case 'teacher_reviewed':
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100/80">
            {t('status.teacherReviewed')}
          </Badge>
        )
      case 'needs_attention':
        return <Badge variant="destructive">{t('status.needsAttention')}</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-8">
      {/* Summary Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/30 p-6 rounded-xl border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{t('header.title')}</h2>
            {getStatusBadge(submission.status)}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('header.submittedOn', { date: new Date(submission.submitted_at).toLocaleDateString() })}
          </p>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1">
              {t('header.aiScore')}
            </p>
            <p className="text-2xl font-bold text-blue-600">
              {submission.ai_score !== null ? `${submission.ai_score}%` : 'N/A'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1">
              {t('header.finalScore')}
            </p>
            <p className="text-2xl font-bold text-green-600">
              {submission.final_score !== null ? `${submission.final_score}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Review Questions */}
      <div className="space-y-6">
        <h3 className="text-lg font-bold flex items-center gap-2">
          {t('questions.title')}
        </h3>

        {(questions || []).sort((a, b) => a.sequence - b.sequence).map((q, idx) => {
          const override = overrides[q.id]
          const isCorrect = override?.is_correct
          const isPendingReview = q.question_type === 'free_text' && submission.status === 'pending'
          const isFreeText = q.question_type === 'free_text'

          return (
            <Card key={q.id} className={cn(
              "overflow-hidden border-l-4",
              isCorrect ? "border-l-green-500" : "border-l-red-500"
            )}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase font-bold text-muted-foreground">
                        {t('questions.questionLabel', { index: idx + 1 })} • {q.question_type.replace('_', ' ')}
                      </Badge>
                      {override?.is_overridden && (
                        <Badge variant="outline" className="text-xs border-purple-300">
                          <IconUser className="mr-1 h-3 w-3" />
                          {t('questions.overriddenBadge')}
                        </Badge>
                      )}
                      {isPendingReview && (
                        <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700">
                          <IconHourglass className="mr-1 h-3 w-3" />
                          {t('questions.needsGradingBadge')}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-base leading-tight">
                      {q.question_text}
                    </CardTitle>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black">
                      {override?.points_earned ?? 0}/{q.points_possible}
                    </div>
                    <span className="text-xs text-muted-foreground">{t('questions.pointsLabel')}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Options mapping for non-free text */}
                {!isFreeText && (
                  <div className="space-y-2">
                    {q.options?.map((opt: any) => {
                      const isSelected = opt.option_text === q.answer_text
                      return (
                        <div key={opt.id} className={cn(
                          "p-3 rounded-lg border flex items-center justify-between text-sm",
                          opt.is_correct ? "bg-green-50 border-green-200 text-green-900" :
                            isSelected ? "bg-red-50 border-red-200 text-red-900" : "bg-muted/30"
                        )}>
                          <span className="font-medium">{opt.option_text}</span>
                          <div className="flex items-center gap-2">
                            {isSelected && <Badge variant="outline" className="text-xs">{t('questions.selectedBadge')}</Badge>}
                            {opt.is_correct && <Badge className="bg-green-600 text-white text-xs">{t('questions.correctBadge')}</Badge>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Free text answer */}
                {isFreeText && (
                  <div>
                    <Label className="text-xs font-bold uppercase text-muted-foreground">{t('questions.studentAnswerLabel')}</Label>
                    <div className="mt-1 p-4 bg-muted rounded-lg text-sm leading-relaxed">
                      {q.answer_text || <span className="italic text-muted-foreground">{t('questions.noAnswerProvided')}</span>}
                    </div>
                    {q.ai_grading_criteria && (
                      <p className="text-xs text-muted-foreground mt-2">
                        <span className="font-bold">{t('questions.gradingCriteria')}:</span> {q.ai_grading_criteria}
                      </p>
                    )}
                    {q.expected_keywords && q.expected_keywords.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-bold">{t('questions.expectedKeywords')}:</span> {q.expected_keywords.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                {/* AI Feedback */}
                {q.ai_feedback && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <IconRobot className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-bold text-blue-900 dark:text-blue-300">{t('aiFeedback.title')}</span>
                      {q.ai_confidence != null && (
                        <Badge variant="secondary" className="text-xs">
                          {t('aiFeedback.confidence', { confidence: (q.ai_confidence * 100).toFixed(0) })}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{q.ai_feedback}</p>
                  </div>
                )}

                {/* Teacher Override Interface */}
                {editingQuestionId === q.id ? (
                  <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-4 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <IconPencil className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-bold text-purple-900 dark:text-purple-300">{t('teacherOverride.title')}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label>{t('teacherOverride.pointsEarnedLabel')}</Label>
                        <Input
                          type="number"
                          min="0"
                          max={q.points_possible}
                          value={override?.points_earned}
                          onChange={(e) => updateQuestionOverride(q.id, { points_earned: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="flex-1">
                        <Label>{t('teacherOverride.statusLabel')}</Label>
                        <div className="flex items-center h-10 border rounded px-3 bg-white">
                          <span className="text-sm font-medium mr-auto">{isCorrect ? t('teacherOverride.correctStatus') : t('teacherOverride.incorrectStatus')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Label>{t('teacherOverride.markAsLabel')}:</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant={override?.is_correct ? "default" : "outline"}
                        className={cn(override?.is_correct && "bg-green-600 hover:bg-green-700")}
                        onClick={() => updateQuestionOverride(q.id, { is_correct: true })}
                      >
                        <IconCheck className="mr-1 h-4 w-4" /> {t('teacherOverride.correctButton')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={!override?.is_correct ? "default" : "outline"}
                        className={cn(!override?.is_correct && "bg-red-600 hover:bg-red-700")}
                        onClick={() => updateQuestionOverride(q.id, { is_correct: false })}
                      >
                        <IconX className="mr-1 h-4 w-4" /> {t('teacherOverride.incorrectButton')}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('teacherOverride.teacherNotesLabel')}</Label>
                      <Textarea
                        value={override?.teacher_notes || ''}
                        onChange={(e) => updateQuestionOverride(q.id, { teacher_notes: e.target.value })}
                        placeholder={t('teacherOverride.teacherNotesPlaceholder')}
                      />
                    </div>

                    <Button
                      className="w-full bg-purple-600 hover:bg-purple-700"
                      onClick={() => setEditingQuestionId(null)}
                    >
                      {t('teacherOverride.doneButton')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    {override?.teacher_notes ? (
                      <div className="flex-1 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 rounded-lg">
                        <div className="flex items-center gap-1 mb-1">
                          <IconUser className="h-3 w-3 text-purple-600" />
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300">{t('teacherOverride.teacherNotesBadge')}</span>
                        </div>
                        <p className="text-sm">{override.teacher_notes}</p>
                      </div>
                    ) : <div className="flex-1" />}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingQuestionId(q.id)}
                      className="shrink-0"
                    >
                      <IconPencil className="h-4 w-4 mr-1" />
                      {isFreeText && isPendingReview ? t('teacherOverride.gradeButton') : t('teacherOverride.overrideButton')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Final Review & Actions */}
      <Card className="border-2 border-primary/20 shadow-xl overflow-hidden">
        <div className="bg-primary/5 px-6 py-4 border-b border-primary/10">
          <h3 className="font-bold flex items-center gap-2">
            <IconMessage className="h-5 w-5 text-primary" />
            {t('finalReview.title')}
          </h3>
        </div>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-bold">{t('finalReview.teacherFeedbackLabel')}</Label>
            <Textarea
              value={teacherFeedback}
              onChange={(e) => setTeacherFeedback(e.target.value)}
              placeholder={t('finalReview.teacherFeedbackPlaceholder')}
              rows={4}
            />
          </div>

          <div className="flex items-center justify-between pt-4 gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <IconAlertTriangle className="h-4 w-4 text-amber-500" />
              {t('finalReview.finalNotice')}
            </div>
            <Button
              onClick={handleSaveReview}
              disabled={loading}
              className="px-8 shadow-lg shadow-primary/20"
            >
              {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('finalReview.saveReviewButton')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
