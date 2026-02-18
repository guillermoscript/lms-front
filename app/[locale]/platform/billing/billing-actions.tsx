"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { confirmManualPayment } from "@/app/actions/admin/billing"
import { rejectManualPayment } from "@/app/actions/platform/plans"

interface Props {
  requestId: string
}

export function BillingActions({ requestId }: Props) {
  const router = useRouter()
  const [loadingConfirm, setLoadingConfirm] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [reason, setReason] = useState('')
  const [loadingReject, setLoadingReject] = useState(false)

  async function handleConfirm() {
    setLoadingConfirm(true)
    try {
      await confirmManualPayment(requestId)
      toast.success('Payment confirmed — tenant plan updated')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoadingConfirm(false)
    }
  }

  async function handleReject() {
    if (!reason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    setLoadingReject(true)
    try {
      await rejectManualPayment(requestId, reason)
      toast.success('Request rejected')
      setShowRejectModal(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoadingReject(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={loadingConfirm}
          data-testid="confirm-payment-btn"
        >
          {loadingConfirm ? 'Confirming…' : 'Confirm'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowRejectModal(true)}
          data-testid="reject-payment-btn"
        >
          Reject
        </Button>
      </div>

      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent data-testid="reject-payment-dialog">
          <DialogHeader>
            <DialogTitle>Reject Payment Request</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Reason for rejection (will be stored in admin_notes)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="reject-reason-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={loadingReject} data-testid="confirm-reject-btn">
              {loadingReject ? 'Rejecting…' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
