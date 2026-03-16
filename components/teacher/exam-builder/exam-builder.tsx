'use client'

import { useTranslations } from 'next-intl'
import { IconX } from '@tabler/icons-react'
import { ExamBuilderProvider, useExamBuilder } from './exam-builder-context'
import type { ExamBuilderProps } from './exam-builder-context'
import { ExamBuilderHeader } from './exam-builder-header'
import { ExamDetailsCard } from './exam-details-card'
import { ExamQuestionsToolbar } from './exam-questions-toolbar'
import { ExamQuestionList } from './exam-question-list'
import { ExamBuilderActions } from './exam-builder-actions'

export function ExamBuilder(props: ExamBuilderProps) {
  return (
    <ExamBuilderProvider {...props}>
      <ExamBuilderShell />
    </ExamBuilderProvider>
  )
}

function ExamBuilderShell() {
  const { error } = useExamBuilder()

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <ExamBuilderHeader />

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <IconX className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
        </div>
      )}

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-100 fill-mode-both">
        {/* Exam Details Card */}
        <ExamDetailsCard />

        {/* Questions Section */}
        <div className="space-y-4">
          <ExamQuestionsToolbar />
          <ExamQuestionList />
        </div>

        {/* Action Buttons */}
        <ExamBuilderActions />
      </div>
    </div>
  )
}
