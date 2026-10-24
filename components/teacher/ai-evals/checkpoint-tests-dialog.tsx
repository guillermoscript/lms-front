'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconFlask } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { CheckpointTestsPanel } from './exercise-tests-panel'

/** "Grading tests" trigger for a saved checkpoint; the panel mounts only while the dialog is open. */
export function CheckpointTestsDialog({ checkpointId }: { checkpointId: number }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.checkpoint')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => setOpen(true)}>
        <IconFlask aria-hidden="true" className="h-3.5 w-3.5" />
        {t('trigger')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto pt-10 sm:max-w-3xl">
          <DialogTitle className="sr-only">{t('dialogTitle')}</DialogTitle>
          {open && <CheckpointTestsPanel checkpointId={checkpointId} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
