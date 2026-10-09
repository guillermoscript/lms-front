'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react'
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
import { formatMoney } from '@/lib/payments/format-money'
import { feeErrorKey, parsePayNowAmount, type FeeRail, type PayNowBucket } from '@/lib/billing/platform-fee-view'
import { withRequestSuffix } from '@/lib/billing/platform-fee-reference'
import type { PlatformBankAccountView } from '@/lib/billing/platform-bank-accounts'
import { selectBankAccountsFor } from '@/lib/billing/platform-bank-account-select'
import { BankTransferDetails, TransferReference } from './bank-transfer-details'
import { OpenRequestNotice, type OpenFeeRequest } from './open-request-notice'

/** Codes the API (`POST /api/billing/fees/checkout`) and the local check can return. */
const KNOWN_ERRORS = [
  'unsupported_rail',
  'currency_not_supported_on_rail',
  'nothing_owed',
  'invalid_amount',
  'amount_above_balance',
  'amount_below_minimum',
  'fee_request_open',
  'provider_unavailable',
  'provider_error',
  'forbidden',
  'unauthorized',
] as const

interface RegisteredTransfer {
  requestId: string
  amount: number
  currency: string
  expiresAt: string | null
}

/** Variant 1: the transfer was registered — where to send it and what to quote. */
function TransferRegistered({
  transfer,
  accounts,
  tenantReference,
  onDone,
}: {
  transfer: RegisteredTransfer
  accounts: readonly PlatformBankAccountView[]
  tenantReference: string
  onDone: () => void
}) {
  const t = useTranslations('platformFees.payNow')
  const locale = useLocale()
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('instructions.title')}</DialogTitle>
        <DialogDescription>
          {t(accounts.length > 0 ? 'instructions.bodyWithDetails' : 'instructions.body', {
            amount: formatMoney(transfer.amount, transfer.currency, locale),
          })}
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid="fee-pay-now-instructions">
        <dt className="text-muted-foreground">{t('instructions.reference')}</dt>
        <dd className="break-all font-mono text-xs">{transfer.requestId}</dd>
      </dl>
      <BankTransferDetails accounts={accounts} currency={transfer.currency}>
        <TransferReference value={withRequestSuffix(tenantReference, transfer.requestId)} />
      </BankTransferDetails>
      {transfer.expiresAt ? (
        <p className="text-xs text-muted-foreground">
          {t('instructions.expires', {
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(transfer.expiresAt)),
          })}
        </p>
      ) : null}
      <DialogFooter>
        <Button onClick={onDone}>{t('instructions.done')}</Button>
      </DialogFooter>
    </>
  )
}

/** Always-visible pointer to the open transfer while another rail is selected. */
function OpenRequestHint({ request }: { request: OpenFeeRequest }) {
  const t = useTranslations('platformFees.payNow')
  const locale = useLocale()
  return (
    <p className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm" role="status" data-testid="fee-pay-now-open-request-hint">
      <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{t('openRequestHint', { amount: formatMoney(request.amount, request.currency, locale) })}</span>
    </p>
  )
}

/** Variant 2: choose currency, rail and amount, then pay or register a transfer. */
function PayNowForm({
  buckets,
  bankAccounts,
  tenantReference,
  openRequest,
  onRegistered,
  onCancel,
}: {
  buckets: PayNowBucket[]
  bankAccounts: readonly PlatformBankAccountView[]
  tenantReference: string
  openRequest: OpenFeeRequest | null
  onRegistered: (transfer: RegisteredTransfer) => void
  onCancel: () => void
}) {
  const t = useTranslations('platformFees.payNow')
  const locale = useLocale()
  const router = useRouter()

  const [currency, setCurrency] = useState(buckets[0].currency)
  const bucket = buckets.find((b) => b.currency === currency) ?? buckets[0]
  // Card first, unless a transfer is open and card is not offered: then the open request is what matters.
  const [rail, setRail] = useState<FeeRail>(
    openRequest && !bucket.rails.includes('stripe') ? 'manual' : (bucket.rails[0] ?? 'manual'),
  )
  const [amount, setAmount] = useState(bucket.netOwed.toFixed(2))
  const [bankReference, setBankReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Derived in render, not stored.
  const cardOffered = bucket.rails.includes('stripe')
  const parsed = parsePayNowAmount(amount, bucket.netOwed, rail)
  // The route refuses a second transfer while one is open; card stays available.
  const pendingTransfer = rail === 'manual' ? openRequest : null

  const selectBucket = (c: string) => {
    const next = buckets.find((b) => b.currency === c)
    if (!next) return
    setCurrency(c)
    setRail(next.rails.includes(rail) ? rail : next.rails[0])
    setAmount(next.netOwed.toFixed(2))
    setFieldError(null)
    setSubmitError(null)
  }

  const fail = (message: string) => {
    // Inline (the modal can sit above the toaster) and as a toast.
    setSubmitError(message)
    toast.error(message)
  }

  async function submit() {
    if (!parsed.ok) {
      setFieldError(t(`errors.${parsed.error}`))
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/billing/fees/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: rail,
          currency: bucket.currency,
          amount: parsed.amount,
          locale,
          ...(rail === 'manual' ? { bankReference, notes } : {}),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        fail(t(`errors.${feeErrorKey(body.code, KNOWN_ERRORS)}`))
        // A transfer opened elsewhere: reload so the notice replaces the form.
        if (body.code === 'fee_request_open') router.refresh()
        return
      }
      if (body.kind === 'instructions') {
        onRegistered({
          requestId: String(body.requestId),
          amount: Number(body.amount),
          currency: String(body.currency).toUpperCase(),
          expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
        })
        router.refresh()
        return
      }
      if (typeof body.url === 'string' && body.url) {
        setRedirecting(true)
        window.location.assign(body.url)
        return
      }
      fail(t('errors.generic'))
    } catch {
      fail(t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {buckets.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="fee-currency">{t('currency')}</Label>
            <select
              id="fee-currency"
              value={currency}
              onChange={(e) => selectBucket(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              data-testid="fee-pay-now-currency"
            >
              {buckets.map((b) => (
                <option key={b.currency} value={b.currency}>
                  {b.currency} · {formatMoney(b.netOwed, b.currency, locale)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {openRequest && rail !== 'manual' ? <OpenRequestHint request={openRequest} /> : null}

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">{t('rail')}</legend>
          {bucket.rails.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="fee-rail"
                value={r}
                checked={rail === r}
                onChange={() => {
                  setRail(r)
                  setFieldError(null)
                  setSubmitError(null)
                }}
                className="mt-0.5 accent-primary"
                data-testid={`fee-pay-now-rail-${r}`}
              />
              <span>
                <span className="block font-medium">{t(`rails.${r}`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`railHints.${r}`)}</span>
              </span>
            </label>
          ))}
          {cardOffered ? null : <p className="text-xs text-muted-foreground">{t('cardUnavailable')}</p>}
        </fieldset>

        {pendingTransfer ? (
          <OpenRequestNotice request={pendingTransfer} reference={tenantReference ? withRequestSuffix(tenantReference, pendingTransfer.id) : ''}>
            <BankTransferDetails accounts={selectBankAccountsFor(bankAccounts, pendingTransfer.currency)} currency={pendingTransfer.currency} />
          </OpenRequestNotice>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="fee-amount">{t('amountLabel', { currency: bucket.currency })}</Label>
              <Input
                id="fee-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setFieldError(null)
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby="fee-amount-hint"
                data-testid="fee-pay-now-amount"
              />
              <p id="fee-amount-hint" className={fieldError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'} aria-live="polite">
                {fieldError ?? t('amountHint', { amount: formatMoney(bucket.netOwed, bucket.currency, locale) })}
              </p>
            </div>

            {rail === 'manual' ? (
              <>
                <BankTransferDetails accounts={selectBankAccountsFor(bankAccounts, bucket.currency)} currency={bucket.currency}>
                  {tenantReference ? <TransferReference value={tenantReference} /> : null}
                </BankTransferDetails>
                <div className="space-y-1.5">
                  <Label htmlFor="fee-bank-ref">{t('bankReference')}</Label>
                  <Input
                    id="fee-bank-ref"
                    value={bankReference}
                    maxLength={255}
                    onChange={(e) => setBankReference(e.target.value)}
                    aria-describedby="fee-bank-ref-hint"
                  />
                  <p id="fee-bank-ref-hint" className="text-xs text-muted-foreground">{t('bankReferenceHint')}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fee-notes">{t('notes')}</Label>
                  <Textarea id="fee-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </>
            ) : null}
          </>
        )}

        {submitError ? (
          <p
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
            data-testid="fee-pay-now-error"
          >
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {submitError}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button onClick={submit} disabled={submitting || redirecting || pendingTransfer !== null} data-testid="fee-pay-now-submit">
          {redirecting
            ? t('redirecting')
            : submitting
              ? t('submitting')
              : t('submit', {
                  amount: parsed.ok ? formatMoney(parsed.amount, bucket.currency, locale) : bucket.currency,
                })}
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * Pay-now for the platform fee balance (#929, design 2.4). The amount typed
 * here is only a CAP: the route derives what is charged from the live ledger
 * (`min(netOwed, requested)`), so a stale or edited figure can never charge
 * more than is owed. Card (Stripe) is USD only; any currency by transfer.
 *
 * Two explicit variants share the dialog: `PayNowForm` and, once a transfer
 * is registered, `TransferRegistered`. The form remounts on every open, so
 * its state starts fresh without a reset routine.
 */
export function FeePayNowDialog({
  buckets,
  bankAccounts,
  tenantReference,
  openRequest,
}: {
  buckets: PayNowBucket[]
  /** Active platform accounts relevant to the payable currencies, server-selected. */
  bankAccounts: readonly PlatformBankAccountView[]
  /** `FEES-<SLUG>` (empty when unknown): the reference to quote on the transfer. */
  tenantReference: string
  /** A transfer already waiting for confirmation. */
  openRequest: OpenFeeRequest | null
}) {
  const t = useTranslations('platformFees.payNow')
  const [open, setOpen] = useState(false)
  const [registered, setRegistered] = useState<RegisteredTransfer | null>(null)

  // Every close path (Done, Cancel, X, Escape, overlay) goes through here.
  // Closing drops the success view; the form remounts on the next open.
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setRegistered(null)
  }

  if (buckets.length === 0) return null

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="fee-pay-now-btn">
        {t('title')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
      >
        <DialogContent data-testid="fee-pay-now-dialog" className="max-h-[90dvh] overflow-y-auto">
          {registered ? (
            <TransferRegistered
              transfer={registered}
              accounts={selectBankAccountsFor(bankAccounts, registered.currency)}
              tenantReference={tenantReference}
              onDone={() => handleOpenChange(false)}
            />
          ) : (
            <PayNowForm
              buckets={buckets}
              bankAccounts={bankAccounts}
              tenantReference={tenantReference}
              openRequest={openRequest}
              onRegistered={setRegistered}
              onCancel={() => handleOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
