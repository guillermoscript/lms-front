'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  IconArrowLeft,
  IconChevronRight,
} from '@tabler/icons-react'
import { VersionHistorySheet } from '../version-history-sheet'
import { ExamTestsDialog } from '../ai-evals/exam-tests-dialog'
import type { ExamQuestionInfo } from '../ai-evals/exam-types'
import { useExamBuilder, type ExamFormData } from './exam-builder-context'

const isSavedId = (id: number | string) => /^\d+$/.test(String(id))

/** Only what the grading tests need. Never carries correct answers, keywords or rubrics. */
function toTestQuestions(questions: ExamFormData['questions']): ExamQuestionInfo[] {
  return questions
    .filter((q) => isSavedId(q.id))
    .map((q) => ({
      id: String(q.id),
      type: q.question_type,
      text: q.question_text,
      points: q.points_possible,
      options: q.options.filter((o) => isSavedId(o.id)).map((o) => ({ id: String(o.id), text: o.option_text })),
    }))
}

/** Anything a grading run would see differently from the saved exam. */
function signature(questions: ExamFormData['questions']): string {
  return JSON.stringify(
    questions.map((q) => [q.id, q.question_type, q.question_text, q.points_possible, q.ai_grading_criteria, q.grading_rubric ?? '', q.expected_keywords, q.options.map((o) => [o.id, o.option_text, o.is_correct])])
  )
}

export function ExamBuilderHeader() {
  const { courseId, courseTitle, initialData, formData } = useExamBuilder()
  const t = useTranslations('dashboard.teacher.examBuilder')
  const router = useRouter()
  const [savedSignature] = useState(() => signature(formData.questions))
  const testQuestions = useMemo(() => toTestQuestions(formData.questions), [formData.questions])
  const hasUnsavedChanges = signature(formData.questions) !== savedSignature

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
        <div className="ml-auto flex items-center gap-2">
          <ExamTestsDialog examId={initialData.exam_id} questions={testQuestions} hasUnsavedChanges={hasUnsavedChanges} />
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
