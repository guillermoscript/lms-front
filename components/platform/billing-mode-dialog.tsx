'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { setTenantBillingMode } from '@/app/actions/platform/billing-mode'
import { convertCompedTenantToPaid } from '@/app/actions/platform/plans'
import { BILLING_MODES, normalizeBillingMode, type BillingMode } from '@/lib/billing/billing-mode'
import {
  PLAN_SLUGS,
  validateBillingModeInput,
  type BillingModeField,
} from '@/lib/billing/billing-mode-input'

const MODE_HELP: Record<BillingMode, string> = {
  paid: 'Normal billing: subscription, fee ledger and cutoffs apply. Keeps the current plan.',
  comped: 'Free plan granted by you. Pays the fee below on student sales (notify only), never blocked.',
  internal: 'Platform-owned school. Enterprise plan, never charged, never cut off, no fee.',
}

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

  const err = (id: string, msg?: string) =>
    msg ? (
      <p id={id} role="alert" className="text-xs text-destructive">
        {msg}
      </p>
    ) : null

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

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="billing-mode-select">Mode</Label>
            <Select value={mode} onValueChange={(v) => v && setMode(v as BillingMode)}>
              <SelectTrigger id="billing-mode-select" data-testid="billing-mode-select" aria-describedby="billing-mode-help">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                {BILLING_MODES.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="billing-mode-help" className="text-xs text-muted-foreground">
              {MODE_HELP[mode]}
            </p>
            {err('billing-mode-error', errors.mode)}
          </div>

          {mode === 'comped' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="billing-mode-plan">Plan</Label>
                <Select value={plan} onValueChange={(v) => v && setPlan(v)}>
                  <SelectTrigger
                    id="billing-mode-plan"
                    data-testid="billing-mode-plan"
                    aria-invalid={!!errors.plan}
                    aria-describedby={errors.plan ? 'billing-mode-plan-error' : undefined}
                  >
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_SLUGS.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err('billing-mode-plan-error', errors.plan)}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="billing-mode-until">Expires (optional)</Label>
                  <Input
                    id="billing-mode-until"
                    type="date"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    data-testid="billing-mode-until"
                    aria-invalid={!!errors.comped_until}
                    aria-describedby={errors.comped_until ? 'billing-mode-until-error' : undefined}
                  />
                  {err('billing-mode-until-error', errors.comped_until)}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billing-mode-fee">Fee on student sales (%)</Label>
                  <Input
                    id="billing-mode-fee"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    data-testid="billing-mode-fee"
                    aria-invalid={!!errors.fee_percent_override}
                    aria-describedby={errors.fee_percent_override ? 'billing-mode-fee-error' : undefined}
                  />
                  {err('billing-mode-fee-error', errors.fee_percent_override)}
                </div>
              </div>
            </>
          )}

          {mode !== 'paid' && (
            <div className="space-y-1.5">
              <Label htmlFor="billing-mode-reason">Reason</Label>
              <Textarea
                id="billing-mode-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this school comped / internal?"
                data-testid="billing-mode-reason"
                aria-invalid={!!errors.reason}
                aria-describedby={errors.reason ? 'billing-mode-reason-error' : undefined}
              />
              {err('billing-mode-reason-error', errors.reason)}
            </div>
          )}
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
