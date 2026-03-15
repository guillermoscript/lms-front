'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { createFlag } from '@/app/actions/community'

interface FlagDialogProps {
  targetType: 'post' | 'comment'
  targetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FlagDialog({ targetType, targetId, open, onOpenChange }: FlagDialogProps) {
  const t = useTranslations('community')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!reason.trim()) return

    setSubmitting(true)
    try {
      const result = await createFlag(targetType, targetId, reason.trim())
      if (result.success) {
        toast.success(t('flagSubmitted'))
        setReason('')
        onOpenChange(false)
      } else {
        toast.error(result.error || t('errorPosting'))
      }
    } catch {
      toast.error(t('errorPosting'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('flagTitle')}</DialogTitle>
          <DialogDescription>{t('flagDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="flag-reason">{t('flagReason')}</Label>
          <Textarea
            id="flag-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('flagDescription')}
            className="min-h-[100px] resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !reason.trim()}>
            {t('flagSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
