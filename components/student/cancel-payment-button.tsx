'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cancelPaymentRequest } from '@/app/actions/payment-requests'
import { IconLoader2, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'

interface CancelPaymentButtonProps {
  requestId: number
}

export function CancelPaymentButton({ requestId }: CancelPaymentButtonProps) {
  const router = useRouter()
  const t = useTranslations('components.cancelPaymentButton')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const handleCancel = async () => {
    setLoading(true)

    try {
      await cancelPaymentRequest(requestId)
      toast.success(t('success'))
      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error('Failed to cancel payment request:', error)
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="destructive" className="gap-1" onClick={() => setOpen(true)}>
        <IconX className="w-3 h-3" />
        {t('cancel')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirmDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t('keepRequest')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleCancel} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {loading ? (
              <>
                <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('cancelling')}
              </>
            ) : (
              t('confirmCancel')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
