'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconLoader2,
  IconArrowLeft,
  IconDeviceFloppy,
  IconRobot,
  IconClock,
  IconCircleCheck,
  IconCircleX,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { VersionHistorySheet } from './version-history-sheet'

interface QuestionData {
  id: number | string
  question_text: string
  question_type: 'multiple_choice' | 'true_false' | 'free_text'
  points_possible: number
  sequence: number
  ai_grading_criteria: string
  expected_keywords: string[]
  grading_rubric?: string
  options: {
    id: number | string
    option_text: string
    is_correct: boolean
  }[]
}

interface ExamBuilderProps {
  courseId: number
  courseTitle: string
  initialData?: any
}

export function ExamBuilder({ courseId, courseTitle, initialData }: ExamBuilderProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.examBuilder')
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    duration_minutes: initialData?.duration_minutes || null,
    sequence: initialData?.sequence || 1,
    status: initialData?.status || 'draft',
    questions: (initialData?.questions || []).sort((a: any, b: any) => a.sequence - b.sequence) as QuestionData[],
  })

  const addQuestion = (type: QuestionData['question_type']) => {
    const newQuestion: QuestionData = {
      id: `new-${Date.now()}`,
      question_text: '',
      question_type: type,
      points_possible: 10,
      sequence: formData.questions.length + 1,
      ai_grading_criteria: '',
      expected_keywords: [],
      grading_rubric: '',
      options: type === 'true_false'
        ? [
          { id: `opt-true-${Date.now()}`, option_text: 'True', is_correct: true },
          { id: `opt-false-${Date.now()}`, option_text: 'False', is_correct: false }
        ]
        : type === 'multiple_choice'
          ? [
            { id: `opt-1-${Date.now()}`, option_text: '', is_correct: true },
            { id: `opt-2-${Date.now()}`, option_text: '', is_correct: false }
          ]
          : [],
    }
    setFormData({ ...formData, questions: [...formData.questions, newQuestion] })
  }

  const removeQuestion = (id: number | string) => {
    setFormData({
      ...formData,
      questions: formData.questions
        .filter((q) => q.id !== id)
        .map((q, idx) => ({ ...q, sequence: idx + 1 })),
    })
  }

  const updateQuestion = (id: number | string, updates: Partial<QuestionData>) => {
    setFormData({
      ...formData,
      questions: formData.questions.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    })
  }

  const handleSave = async (publish: boolean) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const examData = {
        course_id: courseId,
        title: formData.title,
        description: formData.description,
        duration_minutes: formData.duration_minutes,
        sequence: formData.sequence,
        status: publish ? 'published' : 'draft',
        created_by: user.id,
      }

      let examId: number

      if (initialData) {
        const { error: updateError } = await supabase
          .from('exams')
          .update(examData)
          .eq('id', initialData.id)
        if (updateError) throw updateError
        examId = initialData.id
      } else {
        const { data: newExam, error: insertError } = await supabase
          .from('exams')
          .insert([examData])
          .select()
          .single()
        if (insertError) throw insertError
        examId = newExam.id
      }

      // Handle Questions (Simpler approach: Delete and re-insert for now)
      // NOTE: In production, consider a more surgical update/upsert
      await supabase.from('exam_questions').delete().eq('exam_id', examId)

      for (const q of formData.questions) {
        const { data: question, error: qError } = await supabase
          .from('exam_questions')
          .insert({
            exam_id: examId,
            question_text: q.question_text,
            question_type: q.question_type,
            points_possible: q.points_possible,
            sequence: q.sequence,
            ai_grading_criteria: q.ai_grading_criteria,
            expected_keywords: q.expected_keywords,
            grading_rubric: q.grading_rubric,
          })
          .select()
          .single()

        if (qError) throw qError

        if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
          await supabase.from('exam_question_options').insert(
            q.options.map((opt) => ({
              question_id: question.id,
              option_text: opt.option_text,
              is_correct: opt.is_correct,
            }))
          )
        }
      }

      router.push(`/dashboard/teacher/courses/${courseId}`)
      router.refresh()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to save exam')
    } finally {
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
            {t('backToCourse', { course: courseTitle })}
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            {initialData ? t('editTitle') : t('createTitle')}
          </h1>
          {initialData && (
            <VersionHistorySheet
              contentType="exam"
              contentId={initialData.id}
              currentSnapshot={formData}
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

      <div className="space-y-6">
        {/* Exam Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t('details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('titleLabel')} <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('descriptionPlaceholder')}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration" className="flex items-center gap-1.5">
                  <IconClock className="h-4 w-4" />
                  {t('durationLabel')}
                </Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.duration_minutes || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      duration_minutes: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder={t('durationPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">{t('durationHint')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sequence">{t('sequenceLabel')}</Label>
                <Input
                  id="sequence"
                  type="number"
                  value={formData.sequence}
                  onChange={(e) =>
                    setFormData({ ...formData, sequence: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{t('questionsTitle')} ({formData.questions.length})</h2>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addQuestion('multiple_choice')}>
                <IconPlus className="mr-1 h-4 w-4" /> {t('addMultipleChoice')}
              </Button>
              <Button size="sm" onClick={() => addQuestion('true_false')}>
                <IconPlus className="mr-1 h-4 w-4" /> {t('addTrueFalse')}
              </Button>
              <Button size="sm" onClick={() => addQuestion('free_text')}>
                <IconPlus className="mr-1 h-4 w-4" /> {t('addFreeText')}
              </Button>
            </div>
          </div>

          {formData.questions.length === 0 ? (
            <Card className="border-dashed py-12 text-center">
              <CardContent>
                <p className="text-muted-foreground">{t('noQuestions')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('noQuestionsDesc')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {formData.questions.map((q, qIdx) => (
                <Card key={q.id} className="relative overflow-hidden">
                  <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs uppercase tracking-wider font-bold">
                          {t('questionLabel', { index: qIdx + 1 })}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] uppercase font-bold text-muted-foreground">
                          {q.question_type === 'free_text' ? t('typeFreeText') :
                            q.question_type === 'true_false' ? t('typeTrueFalse') :
                              t('typeMultipleChoice')}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeQuestion(q.id)}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 md:col-span-9 space-y-2">
                        <Label>{t('questionTextLabel')}</Label>
                        <Textarea
                          value={q.question_text}
                          onChange={(e) => updateQuestion(q.id, { question_text: e.target.value })}
                          placeholder={t('questionTextPlaceholder')}
                          rows={2}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-3 space-y-2">
                        <Label>{t('pointsLabel')}</Label>
                        <Input
                          type="number"
                          value={q.points_possible}
                          onChange={(e) =>
                            updateQuestion(q.id, { points_possible: parseInt(e.target.value) || 0 })
                          }
                          placeholder={t('pointsPlaceholder')}
                        />
                      </div>
                    </div>

                    {/* Options for MC and TF */}
                    {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && (
                      <div className="space-y-3 pt-4 border-t">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {t('answerOptionsLabel')}
                        </Label>
                        <div className="space-y-2">
                          {q.options.map((opt, oIdx) => (
                            <div key={opt.id} className="flex items-center gap-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "shrink-0 rounded-full h-8 w-8 p-0 border flex items-center justify-center",
                                  opt.is_correct ? "bg-green-600 border-green-600 text-white" : "border-muted-foreground/30 text-muted-foreground"
                                )}
                                onClick={() => {
                                  const newOpts = q.options.map((o) => ({
                                    ...o,
                                    is_correct: o.id === opt.id,
                                  }))
                                  updateQuestion(q.id, { options: newOpts })
                                }}
                              >
                                {opt.is_correct ? <IconCircleCheck className="h-5 w-5" /> : <IconCircleX className="h-5 w-5 opacity-20" />}
                              </Button>
                              <Input
                                value={opt.option_text}
                                onChange={(e) => {
                                  const newOpts = q.options.map((o) =>
                                    o.id === opt.id ? { ...o, option_text: e.target.value } : o
                                  )
                                  updateQuestion(q.id, { options: newOpts })
                                }}
                                placeholder={t('optionPlaceholder', { index: oIdx + 1 })}
                                disabled={q.question_type === 'true_false'}
                                className={cn(opt.is_correct && "border-green-400 focus-visible:ring-green-400 bg-green-50/30")}
                              />
                              {q.question_type === 'multiple_choice' && q.options.length > 2 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newOpts = q.options.filter((o) => o.id !== opt.id)
                                    updateQuestion(q.id, { options: newOpts })
                                  }}
                                >
                                  <IconX className="h-3 w-3" />
                                </Button>
                              )}
                              {opt.is_correct && (
                                <span className="text-[10px] font-black uppercase text-green-600 shrink-0">
                                  {t('correctLabel')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        {q.question_type === 'multiple_choice' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newOpts = [
                                ...q.options,
                                { id: `opt-new-${Date.now()}`, option_text: '', is_correct: false },
                              ]
                              updateQuestion(q.id, { options: newOpts })
                            }}
                            className="w-full border-dashed"
                          >
                            <IconPlus className="mr-1 h-3 w-3" /> {t('addOption')}
                          </Button>
                        )}
                        {q.question_type === 'true_false' && (
                          <p className="text-xs text-muted-foreground italic">
                            {t('trueFalseHint')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* AI Grading for Free Text */}
                    {q.question_type === 'free_text' && (
                      <div className="space-y-4 pt-4 border-t bg-primary/5 p-4 rounded-lg border border-primary/20">
                        <div className="flex items-center gap-2 mb-1">
                          <IconRobot className="h-4 w-4 text-primary" />
                          <span className="text-sm font-bold text-primary">{t('aiGradingNotice')}</span>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">{t('gradingRubricLabel')}</Label>
                          <Textarea
                            value={q.grading_rubric}
                            onChange={(e) => updateQuestion(q.id, { grading_rubric: e.target.value })}
                            placeholder={t('gradingRubricPlaceholder')}
                            rows={2}
                            className="bg-white/80"
                          />
                          <p className="text-[10px] text-muted-foreground">{t('gradingRubricHint')}</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">{t('aiGradingCriteriaLabel')}</Label>
                          <Textarea
                            value={q.ai_grading_criteria}
                            onChange={(e) => updateQuestion(q.id, { ai_grading_criteria: e.target.value })}
                            placeholder={t('aiGradingCriteriaPlaceholder')}
                            rows={3}
                            className="bg-white/80"
                          />
                          <p className="text-[10px] text-muted-foreground">{t('aiGradingCriteriaHint')}</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">{t('expectedKeywordsLabel')}</Label>
                          <Input
                            value={q.expected_keywords.join(', ')}
                            onChange={(e) =>
                              updateQuestion(q.id, {
                                expected_keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                              })
                            }
                            placeholder={t('expectedKeywordsPlaceholder')}
                            className="bg-white/80"
                          />
                          <p className="text-[10px] text-muted-foreground">{t('expectedKeywordsHint')}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-6">
          <Button
            variant="outline"
            className="flex-1 h-12"
            onClick={() => handleSave(false)}
            disabled={loading || !formData.title}
          >
            {loading ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconDeviceFloppy className="mr-2 h-4 w-4" />
            )}
            {t('saveDraft')}
          </Button>
          <Button
            className="flex-1 h-12 shadow-lg"
            onClick={() => handleSave(true)}
            disabled={loading || !formData.title || formData.questions.length === 0}
          >
            {loading ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconCircleCheck className="mr-2 h-4 w-4" />
            )}
            {t('publishExam')}
          </Button>
        </div>
      </div>
    </div>
  )
}
