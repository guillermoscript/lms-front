'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  IconLoader2,
  IconDeviceFloppy,
  IconCircleCheck,
} from '@tabler/icons-react'
import { useExamBuilder } from './exam-builder-context'

export function ExamBuilderActions() {
  const { loading, formData, handleSave } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')

  return (
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
  )
}
