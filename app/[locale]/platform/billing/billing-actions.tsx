"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { confirmManualPayment } from "@/app/actions/admin/billing"
import { rejectManualPayment, sendPaymentInstructions } from "@/app/actions/platform/plans"

interface Props {
  requestId: string
  status: string
}

/**
 * Server actions here throw `Error` with a message written for this toast —
 * `rejectManualPayment`'s refusal of an already-decided request among them
 * (#615). Anything that isn't an Error carries no message worth showing.
 */
function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.'
}

/**
 * One primary button per row, chosen by where the request is in its life:
 * a fresh request wants instructions sent; once the school has them (or has
 * reported paying) the job is to confirm the money arrived. Confirm stays
 * reachable on a fresh request for the case where the transfer showed up
 * before anyone sent instructions.
 */
export function BillingActions({ requestId, status }: Props) {
  const router = useRouter()
  const [loadingConfirm, setLoadingConfirm] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [reason, setReason] = useState('')
  const [loadingReject, setLoadingReject] = useState(false)
  const [loadingInstructions, setLoadingInstructions] = useState(false)
  const busy = loadingConfirm || loadingReject || loadingInstructions

  async function handleSendInstructions() {
    setLoadingInstructions(true)
    try {
      await sendPaymentInstructions(requestId)
      toast.success('Instructions marked as sent — school notified')
      router.refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoadingInstructions(false)
    }
  }

  async function handleConfirm() {
    setLoadingConfirm(true)
    try {
      await confirmManualPayment(requestId)
      toast.success('Payment confirmed — school moved to its new plan')
      router.refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoadingConfirm(false)
    }
  }

  async function handleReject() {
    if (!reason.trim()) {
      toast.error('Add a reason — the school will see it')
      return
    }
    setLoadingReject(true)
    try {
      await rejectManualPayment(requestId, reason)
      toast.success('Request rejected')
      setShowRejectModal(false)
      router.refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoadingReject(false)
    }
  }

  const instructionsFirst = status === 'pending'

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        {instructionsFirst && (
          <Button
            size="sm"
            onClick={handleSendInstructions}
            disabled={busy}
            data-testid="send-instructions-btn"
          >
            {loadingInstructions ? 'Sending…' : 'Send instructions'}
          </Button>
        )}
        <Button
          size="sm"
          variant={instructionsFirst ? 'outline' : 'default'}
          onClick={handleConfirm}
          disabled={busy}
          data-testid="confirm-payment-btn"
        >
          {loadingConfirm ? 'Confirming…' : status === 'payment_received' ? 'Confirm receipt' : 'Confirm'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setShowRejectModal(true)}
          disabled={busy}
          data-testid="reject-payment-btn"
        >
          Reject
        </Button>
      </div>

      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent data-testid="reject-payment-dialog">
          <DialogHeader>
            <DialogTitle>Reject this payment request</DialogTitle>
            <DialogDescription>
              The school keeps its current plan. Your reason is shown on the request and kept
              separate from the school&rsquo;s own note.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="e.g. Transfer never arrived after 14 days"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              aria-label="Rejection reason"
              data-testid="reject-reason-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectModal(false)}>Keep request</Button>
            <Button variant="destructive" onClick={handleReject} disabled={loadingReject} data-testid="confirm-reject-btn">
              {loadingReject ? 'Rejecting…' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
