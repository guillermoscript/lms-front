'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconPlus } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import NotificationForm from './notification-form'

export default function CreateNotificationButton() {
  const [open, setOpen] = useState(false)
  const t = useTranslations('dashboard.admin.notifications')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('buttons.create')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('form.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('form.dialog.description')}
          </DialogDescription>
        </DialogHeader>
        <NotificationForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
