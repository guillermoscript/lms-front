'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconFlask } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ExamTestsPanel } from './exam-tests-panel'
import type { ExamQuestionInfo } from './exam-types'

/** "Grading tests" trigger for a saved exam; the panel mounts only while the dialog is open. */
export function ExamTestsDialog({
  examId,
  questions,
  hasUnsavedChanges,
}: {
  examId: number
  questions: ExamQuestionInfo[]
  hasUnsavedChanges: boolean
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.exam')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <IconFlask aria-hidden="true" className="h-3.5 w-3.5" />
        {t('trigger')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto pt-10 sm:max-w-4xl">
          <DialogTitle className="sr-only">{t('dialogTitle')}</DialogTitle>
          {open && <ExamTestsPanel examId={examId} questions={questions} hasUnsavedChanges={hasUnsavedChanges} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
