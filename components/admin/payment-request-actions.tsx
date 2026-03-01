'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import {
  sendPaymentInstructions,
  confirmPaymentReceived,
  completeAndEnroll,
  cancelPaymentRequest,
} from '@/app/actions/payment-requests'
import { IconSend, IconCheck, IconCircleCheck, IconX } from '@tabler/icons-react'

interface PaymentRequestActionsProps {
  request: {
    request_id: number
    status: string
    payment_method: string | null
    payment_instructions: string | null
    payment_amount: number
    payment_currency: string
    admin_notes: string | null
  }
}

export function PaymentRequestActions({ request }: PaymentRequestActionsProps) {
  const t = useTranslations('dashboard.admin.paymentRequests.detail')
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Dialog states
  const [instructionsDialogOpen, setInstructionsDialogOpen] = useState(false)
  const [confirmPaymentDialogOpen, setConfirmPaymentDialogOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  // Form states
  const [paymentMethod, setPaymentMethod] = useState(request.payment_method || 'Bank Transfer')
  const [paymentInstructions, setPaymentInstructions] = useState(
    request.payment_instructions || ''
  )
  const [paymentDeadline, setPaymentDeadline] = useState('')
  const [adminNotes, setAdminNotes] = useState(request.admin_notes || '')
  const [cancelReason, setCancelReason] = useState('')

  const handleSendInstructions = async () => {
    if (!paymentMethod.trim() || !paymentInstructions.trim()) {
      toast.error(t('errors.instructionsRequired'))
      return
    }

    setLoading(true)
    try {
      await sendPaymentInstructions(request.request_id, {
        paymentMethod: paymentMethod.trim(),
        paymentInstructions: paymentInstructions.trim(),
        paymentDeadline: paymentDeadline || undefined,
        paymentAmount: request.payment_amount,
        paymentCurrency: request.payment_currency,
      })

      toast.success(t('success.instructionsSent'))
      setInstructionsDialogOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.instructionsFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmPayment = async () => {
    setLoading(true)
    try {
      await confirmPaymentReceived(request.request_id, adminNotes.trim() || undefined)

      toast.success(t('success.paymentConfirmed'))
      setConfirmPaymentDialogOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.confirmFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    setLoading(true)
    try {
      await completeAndEnroll(request.request_id)

      toast.success(t('success.completed'))
      setCompleteDialogOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.completeFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    setLoading(true)
    try {
      await cancelPaymentRequest(request.request_id, cancelReason.trim() || undefined)

      toast.success(t('success.cancelled'))
      setCancelDialogOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.cancelFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Pending Status: Send Instructions */}
      {request.status === 'pending' && (
        <Button
          onClick={() => setInstructionsDialogOpen(true)}
          className="w-full"
          variant="default"
        >
          <IconSend className="mr-2 h-4 w-4" />
          {t('actions.sendInstructions')}
        </Button>
      )}

      {/* Contacted Status: Confirm Payment */}
      {request.status === 'contacted' && (
        <Button
          onClick={() => setConfirmPaymentDialogOpen(true)}
          className="w-full"
          variant="default"
        >
          <IconCheck className="mr-2 h-4 w-4" />
          {t('actions.confirmPayment')}
        </Button>
      )}

      {/* Payment Received Status: Complete & Enroll */}
      {request.status === 'payment_received' && (
        <Button
          onClick={() => setCompleteDialogOpen(true)}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          <IconCircleCheck className="mr-2 h-4 w-4" />
          {t('actions.completeEnroll')}
        </Button>
      )}

      {/* Cancel Button (available for non-completed/cancelled requests) */}
      {request.status !== 'completed' && request.status !== 'cancelled' && (
        <Button
          onClick={() => setCancelDialogOpen(true)}
          className="w-full"
          variant="destructive"
        >
          <IconX className="mr-2 h-4 w-4" />
          {t('actions.cancel')}
        </Button>
      )}

      {/* Send Instructions Dialog */}
      <Dialog open={instructionsDialogOpen} onOpenChange={setInstructionsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('dialogs.instructions.title')}</DialogTitle>
            <DialogDescription>{t('dialogs.instructions.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">{t('dialogs.instructions.method')}</Label>
              <Input
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="Bank Transfer, Wire Transfer, Cash, etc."
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentInstructions">{t('dialogs.instructions.instructions')}</Label>
              <Textarea
                id="paymentInstructions"
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                placeholder={t('dialogs.instructions.placeholder')}
                rows={6}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                {t('dialogs.instructions.hint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentDeadline">{t('dialogs.instructions.deadline')}</Label>
              <Input
                id="paymentDeadline"
                type="datetime-local"
                value={paymentDeadline}
                onChange={(e) => setPaymentDeadline(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                {t('dialogs.instructions.deadlineOptional')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInstructionsDialogOpen(false)} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSendInstructions} disabled={loading}>
              {loading ? t('common.sending') : t('common.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Payment Dialog */}
      <Dialog open={confirmPaymentDialogOpen} onOpenChange={setConfirmPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('dialogs.confirm.title')}</DialogTitle>
            <DialogDescription>{t('dialogs.confirm.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminNotes">{t('dialogs.confirm.notes')}</Label>
              <Textarea
                id="adminNotes"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder={t('dialogs.confirm.notesPlaceholder')}
                rows={3}
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPaymentDialogOpen(false)} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirmPayment} disabled={loading}>
              {loading ? t('common.confirming') : t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete & Enroll Confirmation */}
      <AlertDialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogs.complete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('dialogs.complete.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={loading}>
              {loading ? t('common.completing') : t('common.complete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Request Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('dialogs.cancel.title')}</DialogTitle>
            <DialogDescription>{t('dialogs.cancel.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancelReason">{t('dialogs.cancel.reason')}</Label>
              <Textarea
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('dialogs.cancel.reasonPlaceholder')}
                rows={3}
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={loading}>
              {t('common.back')}
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={loading}>
              {loading ? t('common.cancelling') : t('common.cancelRequest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
