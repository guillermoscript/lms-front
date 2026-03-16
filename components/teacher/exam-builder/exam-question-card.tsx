'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconTrash,
  IconGripVertical,
} from '@tabler/icons-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useExamBuilder, type QuestionData } from './exam-builder-context'
import { ExamQuestionOptions } from './exam-question-options'
import { ExamQuestionAIGrading } from './exam-question-ai-grading'

interface ExamQuestionCardProps {
  question: QuestionData
  index: number
}

export function ExamQuestionCard({ question: q, index: qIdx }: ExamQuestionCardProps) {
  const { updateQuestion, removeQuestion } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')

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
            <ExamQuestionOptions question={q} />
          )}

          {/* AI Grading for Free Text */}
          {q.question_type === 'free_text' && (
            <ExamQuestionAIGrading question={q} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
