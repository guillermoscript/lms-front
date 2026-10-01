'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MAX_BAN_REASON_LENGTH } from '@/lib/tenant/ban'

interface BanMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  loading: boolean
  /** Receives the reason as typed; the server action trims and caps it. */
  onConfirm: (reason: string) => void
}

/** Ban confirmation with an optional reason (#892). */
export function BanMemberDialog({
  open,
  onOpenChange,
  userName,
  loading,
  onConfirm,
}: BanMemberDialogProps) {
  const t = useTranslations('dashboard.admin.users.actions.dialogs')
  const [reason, setReason] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('')
        onOpenChange(next)
      }}
    >
      <DialogContent data-testid="ban-dialog">
        <DialogHeader>
          <DialogTitle>{t('ban.title')}</DialogTitle>
          <DialogDescription>{t('ban.description', { name: userName })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="ban-reason">{t('ban.reasonLabel')}</Label>
          <Textarea
            id="ban-reason"
            value={reason}
            maxLength={MAX_BAN_REASON_LENGTH}
            placeholder={t('ban.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={loading}
            data-testid="ban-confirm"
          >
            {t('ban.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
