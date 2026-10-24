'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { evalRequest } from './types'

interface PublishTestStatus {
  cases: number
  version_no: number | null
  tested: boolean
}

type Warning = { kind: 'unsaved'; cases: number } | { kind: 'untested'; cases: number; version: number | null }

/**
 * The "tests not run on vN" check before Publish. `statusUrl` is the target's
 * evals status route (null for a target that is not saved yet). Publishing
 * goes ahead silently when the target has no tests, when the status cannot be
 * read, or when a finished run covers the saved version; otherwise the teacher
 * confirms first.
 */
export function usePublishTestsGuard(statusUrl: string | null) {
  const t = useTranslations('dashboard.teacher.aiEvals.publishGuard')
  const [checking, setChecking] = useState(false)
  const [pending, setPending] = useState<{ warning: Warning; publish: () => void } | null>(null)

  const guardPublish = async (publish: () => void, opts: { unsavedAiChanges?: boolean } = {}) => {
    if (!statusUrl) return publish()
    setChecking(true)
    const res = await evalRequest<PublishTestStatus>(statusUrl)
    setChecking(false)
    const status = res.ok ? res.data : null
    if (!status || status.cases === 0) return publish()
    if (opts.unsavedAiChanges) return setPending({ warning: { kind: 'unsaved', cases: status.cases }, publish })
    if (!status.tested) return setPending({ warning: { kind: 'untested', cases: status.cases, version: status.version_no }, publish })
    publish()
  }

  const warning = pending?.warning
  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {warning?.kind === 'untested' && warning.version !== null ? t('untestedTitle', { version: warning.version }) : t('changedTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {warning?.kind === 'unsaved'
              ? t('unsavedDescription', { count: warning.cases })
              : t('untestedDescription', { count: warning?.cases ?? 0 })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const publish = pending?.publish
              setPending(null)
              publish?.()
            }}
          >
            {t('publishAnyway')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { guardPublish, checking, dialog }
}
