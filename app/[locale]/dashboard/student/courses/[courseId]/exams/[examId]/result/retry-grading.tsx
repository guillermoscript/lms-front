'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconAlertTriangle, IconLoader2, IconRefresh } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { gradeExamWithAI } from '@/app/actions/exam-grading'

/**
 * A submission still `pending` on the result page means grading failed after
 * the answers were saved (#847). The grader accepts a pending submission
 * again, so the student can retry instead of waiting on nothing.
 */
export function RetryGrading({ examId, submissionId }: { examId: number; submissionId: number }) {
  const t = useTranslations('examResult.gradingFailed')
  const router = useRouter()
  const [retrying, startRetry] = useTransition()

  const retry = () =>
    startRetry(async () => {
      const result = await gradeExamWithAI({ examId, submissionId })
      // "Already graded" means another tab or device got there first: the
      // refresh shows its result.
      if (!result.success && result.error !== 'Submission already graded') {
        toast.error(t('retryFailed'))
        return
      }
      router.refresh()
    })

  return (
    <Card className="border-2 border-warning/30 shadow-lg overflow-hidden bg-warning/10" data-testid="exam-grading-failed">
      <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="p-2.5 sm:p-3 bg-warning/15 rounded-xl text-warning shrink-0">
          <IconAlertTriangle className="h-5 w-5 sm:h-7 sm:w-7" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-lg text-warning">{t('title')}</h3>
          <p className="text-warning text-sm">{t('description')}</p>
        </div>
        <Button onClick={retry} disabled={retrying} className="gap-2 shrink-0" data-testid="exam-retry-grading">
          {retrying ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconRefresh className="h-4 w-4" />}
          {retrying ? t('retrying') : t('retry')}
        </Button>
      </CardContent>
    </Card>
  )
}
