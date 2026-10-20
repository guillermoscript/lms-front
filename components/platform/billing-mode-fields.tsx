'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BILLING_MODES, type BillingMode } from '@/lib/billing/billing-mode'
import {
  INTERNAL_PLAN_SLUG,
  PLAN_SLUGS,
  type BillingModeField,
} from '@/lib/billing/billing-mode-input'

export const MODE_HELP: Record<BillingMode, string> = {
  paid: 'Normal billing: subscription, fee ledger and cutoffs apply. Keeps the current plan.',
  comped: 'Free plan granted by you. Pays the fee below on student sales (notify only), never blocked.',
  internal: 'Platform-owned school. Enterprise plan, never charged, never cut off, no fee.',
}

export interface BillingFieldsValue {
  mode: BillingMode
  plan: string
  until: string
  fee: string
  reason: string
}

export interface BillingModeFieldsProps {
  value: BillingFieldsValue
  onChange: (patch: Partial<BillingFieldsValue>) => void
  errors?: Partial<Record<BillingModeField, string>>
  /** Modes offered in the select (default: all). */
  modes?: readonly BillingMode[]
  /** Modes for which the plan select is shown (default: comped only). */
  planModes?: readonly BillingMode[]
  /** Replaces the default `paid` help text. */
  helpOverrides?: Partial<Record<BillingMode, string>>
  /** Show the pinned Enterprise plan note for `internal` (create flow). */
  pinInternalPlan?: boolean
  disabled?: boolean
}

export function BillingModeFields({
  value,
  onChange,
  errors = {},
  modes = BILLING_MODES,
  planModes = ['comped'],
  helpOverrides,
  pinInternalPlan = false,
  disabled,
}: BillingModeFieldsProps) {
  const { mode, plan, until, fee, reason } = value
  const help = helpOverrides?.[mode] ?? MODE_HELP[mode]

  const err = (id: string, msg?: string) =>
    msg ? (
      <p id={id} role="alert" className="text-xs text-destructive">
        {msg}
      </p>
    ) : null

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="billing-mode-select">Mode</Label>
        <Select value={mode} onValueChange={(v) => v && onChange({ mode: v as BillingMode })} disabled={disabled}>
          <SelectTrigger
            id="billing-mode-select"
            data-testid="billing-mode-select"
            aria-invalid={!!errors.mode}
            aria-describedby={errors.mode ? 'billing-mode-help billing-mode-error' : 'billing-mode-help'}
          >
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            {modes.map((m) => (
              <SelectItem key={m} value={m} className="capitalize">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="billing-mode-help" className="text-xs text-muted-foreground">
          {help}
        </p>
        {err('billing-mode-error', errors.mode)}
      </div>

      {mode === 'internal' && pinInternalPlan && (
        <div className="space-y-1.5" data-testid="billing-mode-plan-pinned">
          <p className="text-sm font-medium">Plan</p>
          <p className="text-sm capitalize text-muted-foreground">{INTERNAL_PLAN_SLUG} (pinned for internal schools)</p>
        </div>
      )}

      {planModes.includes(mode) && (
        <div className="space-y-1.5">
          <Label htmlFor="billing-mode-plan">Plan</Label>
          <Select value={plan} onValueChange={(v) => v && onChange({ plan: v })} disabled={disabled}>
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
      )}

      {mode === 'comped' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="billing-mode-until">Expires (optional)</Label>
            <Input
              id="billing-mode-until"
              type="date"
              value={until}
              onChange={(e) => onChange({ until: e.target.value })}
              disabled={disabled}
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
              onChange={(e) => onChange({ fee: e.target.value })}
              disabled={disabled}
              data-testid="billing-mode-fee"
              aria-invalid={!!errors.fee_percent_override}
              aria-describedby={errors.fee_percent_override ? 'billing-mode-fee-error' : undefined}
            />
            {err('billing-mode-fee-error', errors.fee_percent_override)}
          </div>
        </div>
      )}

      {mode !== 'paid' && (
        <div className="space-y-1.5">
          <Label htmlFor="billing-mode-reason">Reason</Label>
          <Textarea
            id="billing-mode-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => onChange({ reason: e.target.value })}
            disabled={disabled}
            placeholder="Why is this school comped / internal?"
            data-testid="billing-mode-reason"
            aria-invalid={!!errors.reason}
            aria-describedby={errors.reason ? 'billing-mode-reason-error' : undefined}
          />
          {err('billing-mode-reason-error', errors.reason)}
        </div>
      )}
    </div>
  )
}
