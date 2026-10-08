'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  confirmPlatformFeeRequestAction,
  recordPlatformFeePaymentAction,
  reversePlatformFeePaymentAction,
  setPlatformFeeExemptionAction,
  type FeeActionResult,
} from '@/app/actions/platform/platform-fees'
import { feeErrorKey } from '@/lib/billing/platform-fee-view'

const KNOWN_ERRORS = [
  'invalid_amount',
  'invalid_currency',
  'reason_required',
  'invalid_kind',
  'invalid_id',
  'forbidden',
  'not_found',
  'conflict',
  'not_settled',
  'internal',
] as const

/** Shared submit plumbing: pending flag, localized error toast, refresh on success. */
function useFeeAction() {
  const t = useTranslations('platform.fees')
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function run<T>(fn: () => Promise<FeeActionResult<T>>, success: string): Promise<FeeActionResult<T> | null> {
    setPending(true)
    try {
      const result = await fn()
      if (!result.ok) {
        toast.error(t(`errors.${feeErrorKey(result.error, KNOWN_ERRORS)}`))
        return result
      }
      toast.success(success)
      router.refresh()
      return result
    } catch {
      toast.error(t('errors.generic'))
      return null
    } finally {
      setPending(false)
    }
  }
  return { t, pending, run }
}

function ReasonField({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const t = useTranslations('platform.fees')
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={2}
        maxLength={500}
        required
        placeholder={t('record.reasonPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  submitLabel,
  onSubmit,
  pending,
  destructive = false,
  testId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  submitLabel: string
  onSubmit: () => void
  pending: boolean
  destructive?: boolean
  testId: string
}) {
  const t = useTranslations('platform.fees')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <div className="space-y-3">{children}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onSubmit} disabled={pending} data-testid={`${testId}-submit`}>
            {pending ? t('saving') : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Confirm a manual fee transfer arrived (credits the ledger, audited, replay-safe). */
export function ConfirmFeeRequestButton({ requestId, amountLabel }: { requestId: string; amountLabel: string }) {
  const { t, pending, run } = useFeeAction()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="fee-confirm-request-btn">
        {t('confirm.trigger')}
      </Button>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={t('confirm.title')}
        description={t('confirm.body', { amount: amountLabel })}
        submitLabel={t('confirm.submit')}
        pending={pending}
        testId="fee-confirm-request-dialog"
        onSubmit={async () => {
          const r = await run(() => confirmPlatformFeeRequestAction(requestId), t('confirm.success'))
          if (r?.ok) {
            if (r.value && !r.value.applied) toast.info(t('confirm.replay'))
            setOpen(false)
          }
        }}
      />
    </>
  )
}

/** Record money received off-platform, or waive part of the balance. */
export function RecordFeePaymentDialog({ tenantId, currencies }: { tenantId: string; currencies: string[] }) {
  const { t, pending, run } = useFeeAction()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'offline' | 'waiver'>('offline')
  const [currency, setCurrency] = useState(currencies[0] ?? 'USD')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')

  const reset = () => {
    setKind('offline')
    setAmount('')
    setReason('')
    setReference('')
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="fee-record-payment-btn">
        {t('record.trigger')}
      </Button>
      <ActionDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) reset()
        }}
        title={t('record.title')}
        submitLabel={t('record.submit')}
        pending={pending}
        testId="fee-record-payment-dialog"
        onSubmit={async () => {
          const r = await run(
            () => recordPlatformFeePaymentAction({ tenantId, currency, amount, kind, reason, reference }),
            t('record.success'),
          )
          if (r?.ok) {
            setOpen(false)
            reset()
          }
        }}
      >
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">{t('record.kind')}</legend>
          {(['offline', 'waiver'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="fee-record-kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="accent-primary"
              />
              {t(`record.kinds.${k}`)}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fee-record-currency">{t('record.currency')}</Label>
            <Input
              id="fee-record-currency"
              list="fee-record-currencies"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
            <datalist id="fee-record-currencies">
              {currencies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee-record-amount">{t('record.amount')}</Label>
            <Input
              id="fee-record-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="fee-record-amount"
            />
          </div>
        </div>
        <ReasonField id="fee-record-reason" value={reason} onChange={setReason} label={t('record.reason')} />
        <div className="space-y-1.5">
          <Label htmlFor="fee-record-reference">{t('record.reference')}</Label>
          <Input id="fee-record-reference" maxLength={255} value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </ActionDialog>
    </>
  )
}

/** Adjust down: reverse one credited payment, with a reason. */
export function ReverseFeePaymentButton({ paymentId, amountLabel }: { paymentId: string; amountLabel: string }) {
  const { t, pending, run } = useFeeAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-testid="fee-reverse-payment-btn">
        {t('reverse.trigger')}
      </Button>
      <ActionDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setReason('')
        }}
        title={t('reverse.title')}
        description={t('reverse.body', { amount: amountLabel })}
        submitLabel={t('reverse.submit')}
        pending={pending}
        destructive
        testId="fee-reverse-payment-dialog"
        onSubmit={async () => {
          const r = await run(() => reversePlatformFeePaymentAction(paymentId, reason), t('reverse.success'))
          if (r?.ok) {
            setOpen(false)
            setReason('')
          }
        }}
      >
        <ReasonField id={`fee-reverse-reason-${paymentId}`} value={reason} onChange={setReason} label={t('reverse.reason')} />
      </ActionDialog>
    </>
  )
}

/** Exempt a school from the sales pause (lifts an active block), or end the exemption. */
export function FeeExemptionButton({ tenantId, exempt }: { tenantId: string; exempt: boolean }) {
  const { t, pending, run } = useFeeAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const next = !exempt
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="fee-exemption-btn">
        {exempt ? t('exemption.clear') : t('exemption.set')}
      </Button>
      <ActionDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setReason('')
        }}
        title={next ? t('exemption.titleSet') : t('exemption.titleClear')}
        description={next ? t('exemption.bodySet') : t('exemption.bodyClear')}
        submitLabel={t('exemption.submit')}
        pending={pending}
        testId="fee-exemption-dialog"
        onSubmit={async () => {
          const r = await run(() => setPlatformFeeExemptionAction(tenantId, next, reason), t('exemption.success'))
          if (r?.ok) {
            setOpen(false)
            setReason('')
          }
        }}
      >
        <ReasonField id="fee-exemption-reason" value={reason} onChange={setReason} label={t('exemption.reason')} />
      </ActionDialog>
    </>
  )
}
