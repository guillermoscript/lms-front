'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconCheck, IconCopy } from '@tabler/icons-react'
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

function CopyButton({ value, label }: { value: string; label: string }) {
  const tb = useTranslations('platformFees.payNow.bank')
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked; the text stays selectable on screen.
    }
  }
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => void copy()} aria-label={label}>
      {copied ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
      <span aria-live="polite">{copied ? tb('copied') : tb('copy')}</span>
    </Button>
  )
}

/** Bank details + the reference to quote, or a plain "details will be sent" fallback. */
function BankDetails({ instructions, reference }: { instructions: string | null; reference: string | null }) {
  const tb = useTranslations('platformFees.payNow.bank')
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="fee-bank-details">
      <p className="font-medium">{tb('title')}</p>
      {instructions ? (
        <div className="flex items-start justify-between gap-2">
          <p className="whitespace-pre-wrap break-words" data-testid="fee-bank-instructions">{instructions}</p>
          <CopyButton value={instructions} label={tb('copyDetails')} />
        </div>
      ) : (
        <p className="text-muted-foreground" data-testid="fee-bank-fallback">{tb('fallback')}</p>
      )}
      {reference && (
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <div>
            <p className="text-xs text-muted-foreground">{tb('reference')}</p>
            <p className="break-all font-mono text-xs" data-testid="fee-bank-reference">{reference}</p>
            <p className="text-xs text-muted-foreground">{tb('referenceHint')}</p>
          </div>
          <CopyButton value={reference} label={tb('copyReference')} />
        </div>
      )}
    </div>
  )
}

interface Instructions {
  requestId: string
  amount: number
  currency: string
  expiresAt: string | null
}

/**
 * Pay-now for the platform fee balance (#929, design 2.4). The amount typed
 * here is only a CAP: the route derives what is charged from the live ledger
 * (`min(netOwed, requested)`), so a stale or edited figure can never charge
 * more than is owed. Card (Stripe) is USD only; any currency by transfer.
 */
export function FeePayNowDialog({
  buckets,
  bankInstructions = null,
  tenantReference = null,
}: {
  buckets: PayNowBucket[]
  /** Server-read `PLATFORM_FEE_BANK_INSTRUCTIONS`; null when the platform has not set any. */
  bankInstructions?: string | null
  /** Reference to quote on the transfer, known before submit (tenant based). */
  tenantReference?: string | null
}) {
  const t = useTranslations('platformFees.payNow')
  const locale = useLocale()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [currency, setCurrency] = useState(buckets[0]?.currency ?? 'USD')
  const bucket = useMemo(() => buckets.find((b) => b.currency === currency) ?? buckets[0], [buckets, currency])
  const [rail, setRail] = useState<FeeRail>(bucket?.rails[0] ?? 'manual')
  const [amount, setAmount] = useState(bucket ? bucket.netOwed.toFixed(2) : '')
  const [bankReference, setBankReference] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [instructions, setInstructions] = useState<Instructions | null>(null)

  if (!bucket) return null

  const selectBucket = (c: string) => {
    const next = buckets.find((b) => b.currency === c)
    if (!next) return
    setCurrency(c)
    setRail(next.rails.includes(rail) ? rail : next.rails[0])
    setAmount(next.netOwed.toFixed(2))
    setFieldError(null)
  }

  const reset = () => {
    setInstructions(null)
    setFieldError(null)
    setBankReference('')
    setNotes('')
    setRedirecting(false)
  }

  const cardOffered = bucket.rails.includes('stripe')
  const parsed = parsePayNowAmount(amount, bucket.netOwed, rail)

  async function submit() {
    if (!parsed.ok) {
      setFieldError(t(`errors.${parsed.error}`))
      return
    }
    setSubmitting(true)
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
        toast.error(t(`errors.${feeErrorKey(body.code, KNOWN_ERRORS)}`))
        return
      }
      if (body.kind === 'instructions') {
        setInstructions({
          requestId: String(body.requestId),
          amount: Number(body.amount),
          currency: String(body.currency),
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
      toast.error(t('errors.generic'))
    } catch {
      toast.error(t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  const fmtUtc = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso))

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="fee-pay-now-btn">
        {t('title')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent data-testid="fee-pay-now-dialog" className="max-h-[90dvh] overflow-y-auto">
          {instructions ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('instructions.title')}</DialogTitle>
                <DialogDescription>
                  {t(bankInstructions ? 'instructions.bodyWithDetails' : 'instructions.body', {
                    amount: formatMoney(instructions.amount, instructions.currency, locale),
                  })}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid="fee-pay-now-instructions">
                <dt className="text-muted-foreground">{t('instructions.reference')}</dt>
                <dd className="break-all font-mono text-xs">{instructions.requestId}</dd>
              </dl>
              <BankDetails
                instructions={bankInstructions}
                reference={
                  tenantReference
                    ? `${tenantReference}-${instructions.requestId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
                    : instructions.requestId
                }
              />
              {instructions.expiresAt && (
                <p className="text-xs text-muted-foreground">{t('instructions.expires', { date: fmtUtc(instructions.expiresAt) })}</p>
              )}
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>{t('instructions.done')}</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t('title')}</DialogTitle>
                <DialogDescription>{t('description')}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {buckets.length > 1 && (
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
                )}

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
                  {!cardOffered && <p className="text-xs text-muted-foreground">{t('cardUnavailable')}</p>}
                </fieldset>

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

                {rail === 'manual' && (
                  <>
                    <BankDetails instructions={bankInstructions} reference={tenantReference} />
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
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button onClick={submit} disabled={submitting || redirecting} data-testid="fee-pay-now-submit">
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
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
