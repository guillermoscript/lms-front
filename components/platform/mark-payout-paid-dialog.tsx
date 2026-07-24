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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { markPayoutPaid } from "@/app/actions/platform/payouts"

interface Props {
  tenantId: string
  tenantName: string
  netOwed: number
  currency: string
}

export function MarkPayoutPaidDialog({ tenantId, tenantName, netOwed, currency }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(netOwed.toFixed(2))
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    const parsed = Number(amount)
    if (!(parsed > 0)) {
      toast.error('Enter a positive amount')
      return
    }
    setLoading(true)
    try {
      await markPayoutPaid(tenantId, parsed, currency, note.trim() || undefined)
      toast.success(`Recorded ${parsed.toFixed(2)} ${currency.toUpperCase()} paid to ${tenantName}`)
      setOpen(false)
      setNote('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record payout')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={netOwed <= 0}
        data-testid="mark-paid-btn"
      >
        Mark as Paid
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="mark-paid-dialog">
          <DialogHeader>
            <DialogTitle>Record payout to {tenantName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="payout-amount">Amount paid ({currency.toUpperCase()})</Label>
              <Input
                id="payout-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="mark-paid-amount-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-note">Note (optional)</Label>
              <Textarea
                id="payout-note"
                placeholder="e.g. wire reference, date sent…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                data-testid="mark-paid-note-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={loading} data-testid="confirm-mark-paid-btn">
              {loading ? 'Recording…' : 'Record Payout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
