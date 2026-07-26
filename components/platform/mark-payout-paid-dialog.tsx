"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { nanoid } from "nanoid"
import { useTranslations } from "next-intl"
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
import { MONEY_EPSILON } from "@/lib/payments/payouts-owed"

interface Props {
  tenantId: string
  tenantName: string
  netOwed: number
  currency: string
}

export function MarkPayoutPaidDialog({ tenantId, tenantName, netOwed, currency }: Props) {
  const router = useRouter()
  const t = useTranslations('platform.payouts.dialog')
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(netOwed.toFixed(2))
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [mismatch, setMismatch] = useState<{ netOwed: number } | null>(null)
  // One key per dialog OPEN, replayed by every retry of this submission — a
  // double-click, a reload, a second tab, a second super admin on the same row
  // and a server-action retry all resolve to the same `payouts` row (#547).
  // `nanoid`, not `crypto.randomUUID`: the latter is undefined outside a secure
  // context, and this app is served over plain HTTP in local development.
  const [idempotencyKey, setIdempotencyKey] = useState(() => nanoid())

  function resetForm() {
    setNote('')
    setMismatch(null)
    // The next open is a genuinely new payout and must be able to record a
    // second row for the same amount.
    setIdempotencyKey(nanoid())
  }

  async function handleConfirm() {
    const parsed = Number(amount)
    if (!(parsed > 0)) {
      toast.error(t('errors.positiveAmount'))
      return
    }
    setLoading(true)
    try {
      // `mismatch !== null` is only ever true for the exact amount the warning
      // was raised against: the amount input clears `mismatch` on every change
      // (see its onChange below). Editing the amount after a warning therefore
      // re-submits with `confirmMismatch: false` and the guard in
      // `markPayoutPaid` re-runs on the new value. Keep those two in step — an
      // isolated read of this line looks bypass-prone, which is what #516 §2
      // reported.
      const result = await markPayoutPaid(
        tenantId,
        parsed,
        currency,
        note.trim() || undefined,
        mismatch !== null,
        idempotencyKey,
      )
      if (result.status === 'warning') {
        setMismatch({ netOwed: result.netOwed })
        return
      }
      toast.success(t('success', {
        amount: parsed.toFixed(2),
        currency: currency.toUpperCase(),
        school: tenantName,
      }))
      setOpen(false)
      resetForm()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('errors.failed'))
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
        // Compared against half a cent, not 0: an unrounded residue like
        // `0.002` renders as `$0.00` while leaving this button enabled forever,
        // inviting a payment no operator can actually make (#547). Same
        // threshold the balance itself is floored with.
        disabled={netOwed < MONEY_EPSILON}
        data-testid="mark-paid-btn"
      >
        {t('trigger')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) resetForm()
        }}
      >
        <DialogContent data-testid="mark-paid-dialog">
          <DialogHeader>
            <DialogTitle>{t('title', { school: tenantName })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="payout-amount">{t('amountLabel', { currency: currency.toUpperCase() })}</Label>
              <Input
                id="payout-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  // Each distinct amount must be re-validated by the server
                  // guard; dropping this would let a second typo through on
                  // retry (#516 §2).
                  setMismatch(null)
                }}
                data-testid="mark-paid-amount-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-note">{t('noteLabel')}</Label>
              <Textarea
                id="payout-note"
                placeholder={t('notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                data-testid="mark-paid-note-input"
              />
            </div>
            {mismatch && (
              <div
                className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                data-testid="mark-paid-mismatch-warning"
              >
                <p className="font-medium">{t('mismatchTitle')}</p>
                <p className="mt-1 text-xs">
                  {t('mismatchBody', {
                    suggested: mismatch.netOwed.toFixed(2),
                    entered: Number(amount).toFixed(2),
                    currency: currency.toUpperCase(),
                  })}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleConfirm} disabled={loading} data-testid="confirm-mark-paid-btn">
              {loading ? t('recording') : mismatch ? t('confirmAnyway') : t('submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
