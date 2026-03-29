'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  IconArrowLeft,
  IconChevronRight,
} from '@tabler/icons-react'
import { VersionHistorySheet } from '../version-history-sheet'
import { useExamBuilder } from './exam-builder-context'

export function ExamBuilderHeader() {
  const { courseId, courseTitle, initialData, formData } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')
  const router = useRouter()

  return (
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
            currentSnapshot={formData as unknown as Record<string, unknown>}
            onRestore={() => router.refresh()}
          />
        </div>
      )}
    </div>
  )
}
