'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  IconLoader2,
  IconDeviceFloppy,
  IconCircleCheck,
} from '@tabler/icons-react'
import { useExamBuilder } from './exam-builder-context'
import { usePublishTestsGuard } from '../ai-evals/publish-tests-guard'

export function ExamBuilderActions() {
  const { loading, formData, handleSave, initialData } = useExamBuilder()
  const examId: number | undefined = initialData?.exam_id
  const publishGuard = usePublishTestsGuard(examId ? `/api/teacher/evals/exam/${examId}/status` : null)
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
        onClick={() => void publishGuard.guardPublish(() => void handleSave(true))}
        disabled={loading || publishGuard.checking || !formData.title || formData.questions.length === 0}
      >
        {loading ? (
          <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
        ) : (
          <IconCircleCheck className="h-3.5 w-3.5" />
        )}
        {t('publishExam')}
      </Button>
      {publishGuard.dialog}
    </div>
  )
}
