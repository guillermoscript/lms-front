'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BillingModeFields } from '@/components/platform/billing-mode-fields'
import { setTenantBillingMode } from '@/app/actions/platform/billing-mode'
import { convertCompedTenantToPaid } from '@/app/actions/platform/plans'
import { normalizeBillingMode, type BillingMode } from '@/lib/billing/billing-mode'
import {
  validateBillingModeInput,
  type BillingModeField,
} from '@/lib/billing/billing-mode-input'

export interface BillingModeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  tenantName: string
  currentMode?: string | null
  currentPlan: string
  currentUntil?: string | null
  currentFee?: number | null
}

export function BillingModeDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  currentMode,
  currentPlan,
  currentUntil,
  currentFee,
}: BillingModeDialogProps) {
  const router = useRouter()
  const initialMode = normalizeBillingMode(currentMode)
  const [mode, setMode] = useState<BillingMode>(initialMode)
  const [plan, setPlan] = useState(currentPlan === 'free' ? 'enterprise' : currentPlan)
  const [until, setUntil] = useState(currentUntil ? currentUntil.slice(0, 10) : '')
  const [fee, setFee] = useState(String(currentFee ?? 0))
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Partial<Record<BillingModeField, string>>>({})
  const [loading, setLoading] = useState(false)

  async function submit() {
    const parsed = validateBillingModeInput({
      mode,
      plan,
      comped_until: until,
      fee_percent_override: fee,
      reason,
    })
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      if (parsed.value.mode === 'paid' && initialMode === 'comped') {
        await convertCompedTenantToPaid(tenantId)
      } else {
        await setTenantBillingMode({
          tenantId,
          mode: parsed.value.mode,
          plan: parsed.value.plan,
          comped_until: parsed.value.comped_until,
          fee_percent_override: parsed.value.fee_percent_override,
          reason: parsed.value.reason,
        })
      }
      toast.success('Billing mode updated')
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update billing mode')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="billing-mode-dialog">
        <DialogHeader>
          <DialogTitle>Billing mode — {tenantName}</DialogTitle>
          <DialogDescription>
            Currently <span className="font-medium capitalize">{initialMode}</span> on the{' '}
            <span className="font-medium capitalize">{currentPlan}</span> plan.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <BillingModeFields
            value={{ mode, plan, until, fee, reason }}
            onChange={(patch) => {
              if (patch.mode !== undefined) setMode(patch.mode)
              if (patch.plan !== undefined) setPlan(patch.plan)
              if (patch.until !== undefined) setUntil(patch.until)
              if (patch.fee !== undefined) setFee(patch.fee)
              if (patch.reason !== undefined) setReason(patch.reason)
            }}
            errors={errors}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading} data-testid="billing-mode-submit">
            {loading ? 'Saving…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
