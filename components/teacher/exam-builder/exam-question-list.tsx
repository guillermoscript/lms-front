'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { IconPlus } from '@tabler/icons-react'
import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useExamBuilder } from './exam-builder-context'
import { ExamQuestionCard } from './exam-question-card'

export function ExamQuestionList() {
  const { formData, sensors, handleDragEnd } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')

  if (formData.questions.length === 0) {
    return (
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
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={formData.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {formData.questions.map((q, qIdx) => (
            <ExamQuestionCard
              key={q.id}
              question={q}
              index={qIdx}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
