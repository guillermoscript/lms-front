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
  IconGripVertical,
  IconChevronRight,
} from '@tabler/icons-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
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
  tenantId: string
}

function SortableQuestion({
  q,
  qIdx,
  t,
  updateQuestion,
  removeQuestion,
  children
}: {
  q: QuestionData
  qIdx: number
  t: any
  updateQuestion: any
  removeQuestion: any
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: q.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="relative overflow-hidden group">
        <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
                aria-label={t('dragQuestion')}
              >
                <IconGripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
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
              aria-label={t('removeQuestion')}
            >
              <IconTrash className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        {children}
      </Card>
    </div>
  )
}

export function ExamBuilder({ courseId, courseTitle, initialData, tenantId }: ExamBuilderProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.examBuilder')
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    duration: initialData?.duration || 60,
    sequence: initialData?.sequence || 1,
    status: initialData?.status || 'draft',
    questions: (initialData?.questions || [])
      .map((q: any) => ({
        ...q,
        id: q.question_id || `new-${Math.random()}`,
        options: (q.options || []).map((o: any) => ({
          ...o,
          id: o.option_id || `new-opt-${Math.random()}`
        }))
      }))
      .sort((a: any, b: any) => a.sequence - b.sequence) as QuestionData[],
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setFormData((prev) => {
        const oldIndex = prev.questions.findIndex((q) => q.id === active.id)
        const newIndex = prev.questions.findIndex((q) => q.id === over.id)
        const newQuestions = arrayMove(prev.questions, oldIndex, newIndex).map(
          (q, idx) => ({ ...q, sequence: idx + 1 })
        )
        return { ...prev, questions: newQuestions }
      })
    }
  }

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
        duration: formData.duration,
        sequence: formData.sequence,
        status: publish ? 'published' : 'draft',
        created_by: user.id,
      }

      let examId: number

      if (initialData?.exam_id) {
        const { error: updateError } = await supabase
          .from('exams')
          .update(examData)
          .eq('exam_id', initialData.exam_id)
        if (updateError) throw updateError
        examId = initialData.exam_id
      } else {
        const { data: newExam, error: insertError } = await supabase
          .from('exams')
          .insert([examData])
          .select()
          .single()
        if (insertError) throw insertError
        examId = newExam.exam_id
      }

      // Handle Questions (Simpler approach: Delete and re-insert for now)
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
            tenant_id: tenantId,
          })
          .select()
          .single()

        if (qError) throw qError

        if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
          await supabase.from('question_options').insert(
            q.options.map((opt) => ({
              question_id: question.question_id,
              option_text: opt.option_text,
              is_correct: opt.is_correct,
              tenant_id: tenantId,
            }))
          )
        }
      }

      router.push(`/dashboard/teacher/courses/${courseId}`)
      router.refresh()
    } catch (err: any) {
      console.error(err)
      setError(err.message || t('saveError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/dashboard/teacher/courses/${courseId}`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" aria-label={t('backToCourse', { course: courseTitle })}>
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
          <span className="truncate max-w-[200px]">{courseTitle}</span>
          <IconChevronRight className="h-3 w-3 shrink-0" />
          <span className="font-medium text-foreground">
            {initialData?.exam_id ? t('editTitle') : t('createTitle')}
          </span>
        </div>
        {initialData?.exam_id && (
          <div className="ml-auto">
            <VersionHistorySheet
              contentType="exam"
              contentId={initialData.exam_id}
              currentSnapshot={formData}
              onRestore={() => router.refresh()}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <IconX className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
        </div>
      )}

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-100 fill-mode-both">
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
                  value={formData.duration || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      duration: e.target.value ? parseInt(e.target.value) : 60,
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
              <Button size="sm" className="gap-1.5" onClick={() => addQuestion('multiple_choice')}>
                <IconPlus className="h-3.5 w-3.5" /> {t('addMultipleChoice')}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => addQuestion('true_false')}>
                <IconPlus className="h-3.5 w-3.5" /> {t('addTrueFalse')}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => addQuestion('free_text')}>
                <IconPlus className="h-3.5 w-3.5" /> {t('addFreeText')}
              </Button>
            </div>
          </div>

          {formData.questions.length === 0 ? (
            <Card className="border-dashed border-2 animate-in fade-in duration-300">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                  <IconPlus size={28} className="text-muted-foreground/40" />
                </div>
                <h3 className="text-xl font-bold mb-1.5">{t('noQuestions')}</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('noQuestionsDesc')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext items={formData.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                  {formData.questions.map((q, qIdx) => (
                    <SortableQuestion
                      key={q.id}
                      q={q}
                      qIdx={qIdx}
                      t={t}
                      updateQuestion={updateQuestion}
                      removeQuestion={removeQuestion}
                    >
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
                                    className={cn(opt.is_correct && "border-green-400 focus-visible:ring-green-400 bg-green-50/30 dark:bg-green-950/30")}
                                  />
                                  {q.question_type === 'multiple_choice' && q.options.length > 2 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newOpts = q.options.filter((o) => o.id !== opt.id)
                                        updateQuestion(q.id, { options: newOpts })
                                      }}
                                      aria-label={t('removeOption')}
                                    >
                                      <IconX className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {opt.is_correct && (
                                    <span className="text-[10px] font-black uppercase text-green-600 dark:text-green-400 shrink-0">
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
                                <IconPlus className="h-3 w-3" /> {t('addOption')}
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
                                className="bg-white/80 dark:bg-white/10"
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
                                className="bg-white/80 dark:bg-white/10"
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
                                className="bg-white/80 dark:bg-white/10"
                              />
                              <p className="text-[10px] text-muted-foreground">{t('expectedKeywordsHint')}</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </SortableQuestion>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => handleSave(false)}
            disabled={loading || !formData.title}
          >
            {loading ? (
              <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
            ) : (
              <IconDeviceFloppy className="h-3.5 w-3.5" />
            )}
            {t('saveDraft')}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => handleSave(true)}
            disabled={loading || !formData.title || formData.questions.length === 0}
          >
            {loading ? (
              <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
            ) : (
              <IconCircleCheck className="h-3.5 w-3.5" />
            )}
            {t('publishExam')}
          </Button>
        </div>
      </div>
    </div>
  )
}
