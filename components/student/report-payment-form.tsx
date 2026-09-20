'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { reportManualPayment } from '@/app/actions/payment-requests'
import {
  manualPaymentAccountLabel,
  type ManualPaymentAccount,
} from '@/lib/payments/manual-payment-accounts'
import { IconLoader2, IconReceipt } from '@tabler/icons-react'
import { toast } from 'sonner'

interface ReportPaymentFormProps {
  requestId: number
  /** The school's declared accounts, so "where did you send it" is a choice, not a guess. */
  accounts: ManualPaymentAccount[]
  /** What the school priced the item in — the common case needs no currency input. */
  currency: string
  /** Prefilled when the student is correcting a report they already sent. */
  initial?: {
    reference?: string | null
    paidAt?: string | null
    paidToAccount?: string | null
    amount?: number | null
    currency?: string | null
    payerName?: string | null
    payerDocument?: string | null
    payerBank?: string | null
    payerPhone?: string | null
  }
}

/**
 * "I paid — here is the reference" (#802).
 *
 * This does not move the request's status: an admin still confirms the money
 * against their own statement. What it changes is that they are matching a
 * reference number and a date instead of reading a screenshot, and that the TTL
 * sweep will no longer close this request out from under the student.
 */
export function ReportPaymentForm({ requestId, accounts, currency, initial }: ReportPaymentFormProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.student.payments.report')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    reference: initial?.reference ?? '',
    paidAt: initial?.paidAt ? initial.paidAt.slice(0, 10) : '',
    paidToAccount: initial?.paidToAccount ?? '',
    amount: initial?.amount != null ? String(initial.amount) : '',
    currency: (initial?.currency || currency || 'USD').toUpperCase(),
    payerName: initial?.payerName ?? '',
    payerDocument: initial?.payerDocument ?? '',
    payerBank: initial?.payerBank ?? '',
    payerPhone: initial?.payerPhone ?? '',
  })

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await reportManualPayment(requestId, {
        reference: form.reference,
        // A date input gives a bare day; the school only ever needs the day.
        paidAt: form.paidAt || null,
        paidToAccount: form.paidToAccount || null,
        amount: form.amount || null,
        currency: form.currency || null,
        payerName: form.payerName || null,
        payerDocument: form.payerDocument || null,
        payerBank: form.payerBank || null,
        payerPhone: form.payerPhone || null,
      })
      if (error) throw new Error(error)

      toast.success(t('success'))
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  const text = (
    key: 'reference' | 'payerName' | 'payerDocument' | 'payerBank' | 'payerPhone',
    required = false,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={key} className="text-xs font-medium">
        {t(`fields.${key}`)}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        id={key}
        value={form[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        placeholder={t(`placeholders.${key}`)}
        disabled={loading}
        required={required}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="report-payment-form">
      <div className="grid gap-3 sm:grid-cols-2">
        {text('reference', true)}

        <div className="space-y-1.5">
          <Label htmlFor="paidAt" className="text-xs font-medium">{t('fields.paidAt')}</Label>
          <Input
            id="paidAt"
            type="date"
            value={form.paidAt}
            onChange={(e) => set({ paidAt: e.target.value })}
            disabled={loading}
          />
        </div>

        {/* Where it landed. A school with no declared accounts still gets a free
            text box — the note in its instructions is all it ever published. */}
        <div className="space-y-1.5">
          <Label htmlFor="paidToAccount" className="text-xs font-medium">{t('fields.paidToAccount')}</Label>
          {accounts.length > 0 ? (
            <Select
              value={form.paidToAccount}
              // base-ui hands back `null` when the selection is cleared.
              onValueChange={(value) => set({ paidToAccount: value ?? '' })}
              disabled={loading}
            >
              <SelectTrigger id="paidToAccount">
                <SelectValue placeholder={t('placeholders.paidToAccount')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={manualPaymentAccountLabel(account)}>
                    {manualPaymentAccountLabel(account)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="paidToAccount"
              value={form.paidToAccount}
              onChange={(e) => set({ paidToAccount: e.target.value })}
              placeholder={t('placeholders.paidToAccount')}
              disabled={loading}
            />
          )}
        </div>

        {/* Amount actually sent, which is not always the amount asked for: a
            school that prices in USD is often paid in local currency. */}
        <div className="space-y-1.5">
          <Label htmlFor="amount" className="text-xs font-medium">{t('fields.amount')}</Label>
          <div className="flex gap-2">
            <Input
              id="amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder={t('placeholders.amount')}
              disabled={loading}
              className="flex-1"
            />
            <Input
              id="currency"
              value={form.currency}
              onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 3) })}
              aria-label={t('fields.currency')}
              disabled={loading}
              className="w-20"
            />
          </div>
        </div>
      </div>

      <details className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <summary className="cursor-pointer text-xs font-medium">{t('payerSection')}</summary>
        <p className="mt-1 text-[11px] text-muted-foreground">{t('payerHint')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {text('payerName')}
          {text('payerDocument')}
          {text('payerBank')}
          {text('payerPhone')}
        </div>
      </details>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading} className="gap-2">
          {loading ? (
            <>
              <IconLoader2 className="h-4 w-4 animate-spin" />
              {t('submitting')}
            </>
          ) : (
            <>
              <IconReceipt className="h-4 w-4" />
              {initial?.reference ? t('update') : t('submit')}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
