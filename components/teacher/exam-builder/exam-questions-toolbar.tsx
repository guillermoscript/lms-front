'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { IconPlus } from '@tabler/icons-react'
import { useExamBuilder } from './exam-builder-context'

export function ExamQuestionsToolbar() {
  const { formData, addQuestion } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')

  return (
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
  )
}
