'use client'

import { useId, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { PlatformBankAccountView } from '@/lib/billing/platform-bank-accounts'
import { usdToVes, type VesRate } from '@/lib/billing/ves-rate-convert'
import { CopyButton } from './copy-button'

import { PLATFORM_KIND_FIELDS, type PlatformAccountFieldKey, type PlatformAccountKind } from '@/lib/billing/platform-bank-account-input'

type DetailField = Exclude<PlatformAccountFieldKey, 'extraInstructions'>

/** Which values are worth a copy button, and which read as codes. Labels are UI-owned (en/es), never data. */
const FIELD_STYLE: Record<DetailField, { copy: boolean; mono: boolean }> = {
  bankName: { copy: false, mono: false },
  accountHolder: { copy: true, mono: false },
  accountNumber: { copy: true, mono: true },
  accountType: { copy: false, mono: false },
  routingNumber: { copy: true, mono: true },
  swiftCode: { copy: true, mono: true },
  email: { copy: true, mono: false },
  document: { copy: true, mono: true },
}

/** `accountNumber` holds the Binance Pay ID and the Pago Móvil phone; say so. */
function labelKey(kind: PlatformAccountKind, key: DetailField): string {
  if (key === 'accountNumber' && kind === 'binance') return 'payId'
  if (key === 'accountNumber' && kind === 'pago_movil') return 'phone'
  return key
}

function DetailRow({ label, value, mono, copy }: { label: string; value: string; mono: boolean; copy: boolean }) {
  const tb = useTranslations('platformFees.payNow.bank')
  const valueId = useId()
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd id={valueId} className={mono ? 'overflow-x-auto whitespace-nowrap font-mono text-xs' : 'break-words'}>{value}</dd>
      </div>
      {copy ? <CopyButton value={value} label={tb('copyField', { field: label })} sourceId={valueId} /> : null}
    </div>
  )
}

/**
 * What to send on a VES account for a USD balance: the amount at the stored
 * rate, with the rate and its date. Null when it cannot be computed honestly
 * (other currencies, no amount typed yet, no rate): the caller falls back to
 * the "transfer the equivalent" note.
 */
function vesQuote(account: PlatformBankAccountView, currency: string, amount: number | undefined, vesRate: VesRate | null | undefined) {
  if (account.currency !== 'VES' || currency !== 'USD' || !vesRate || amount === undefined) return null
  const ves = usdToVes(amount, vesRate.vesPerUsd)
  return ves === null ? null : { ves, rate: vesRate }
}

function VesAmountRow({ ves, rate }: { ves: number; rate: VesRate }) {
  const tb = useTranslations('platformFees.payNow.bank')
  const locale = useLocale()
  const valueId = useId()
  const display = new Intl.NumberFormat(locale, { style: 'currency', currency: 'VES' }).format(ves)
  const rateText = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(rate.vesPerUsd)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${rate.date}T00:00:00Z`))
  return (
    <div data-testid="fee-bank-ves-amount">
      <DetailRow label={tb('fields.vesAmount')} value={display} mono={false} copy={false} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" id={valueId}>
          {tb('vesRate', { rate: rateText, source: rate.source, date })}
        </p>
        <CopyButton value={ves.toFixed(2)} label={tb('copyField', { field: tb('fields.vesAmount') })} sourceId={valueId} />
      </div>
    </div>
  )
}

function AccountRows({
  account,
  currency,
  amount,
  vesRate,
}: {
  account: PlatformBankAccountView
  currency: string
  amount?: number
  vesRate?: VesRate | null
}) {
  const tb = useTranslations('platformFees.payNow.bank')
  const quote = vesQuote(account, currency, amount, vesRate)
  return (
    <>
      <p className="text-xs font-medium">
        {account.label}
        {account.kind !== 'bank' ? <span className="font-normal text-muted-foreground"> · {tb(`kinds.${account.kind}`)}</span> : null}
      </p>
      <dl className="space-y-1.5" data-testid="fee-bank-account">
        {PLATFORM_KIND_FIELDS[account.kind].map(({ key }) => {
          if (key === 'extraInstructions') return null
          const value = account[key]
          const { copy, mono } = FIELD_STYLE[key]
          return value ? (
            <div key={key} data-testid={`fee-bank-${key}`}>
              <DetailRow label={tb(`fields.${labelKey(account.kind, key)}`)} value={value} mono={mono} copy={copy} />
            </div>
          ) : null
        })}
        <div>
          <dt className="text-xs text-muted-foreground">{tb('fields.currency')}</dt>
          <dd data-testid="fee-bank-currency">{account.currency}</dd>
        </div>
        {quote ? <VesAmountRow ves={quote.ves} rate={quote.rate} /> : null}
        {account.extraInstructions ? (
          <div>
            <dt className="text-xs text-muted-foreground">{tb('fields.extraInstructions')}</dt>
            <dd className="whitespace-pre-wrap break-words">{account.extraInstructions}</dd>
          </div>
        ) : null}
      </dl>
      {account.currency !== currency && !quote ? (
        <p className="text-xs text-muted-foreground" data-testid="fee-bank-currency-note">
          {tb('currencyNote', { accountCurrency: account.currency, currency })}
        </p>
      ) : null}
    </>
  )
}

/**
 * Where to send a platform-fee transfer: the platform account as labelled rows,
 * or the honest "details will be emailed" fallback when none is configured.
 * Compose a `<TransferReference>` (or anything else) as children.
 */
export function BankTransferDetails({
  accounts,
  currency,
  amount,
  vesRate,
  children,
}: {
  accounts: readonly PlatformBankAccountView[]
  /** The balance currency being paid (a USD fallback account says so). */
  currency: string
  /** Amount being paid in `currency`; with `vesRate` it is converted for VES accounts. */
  amount?: number
  vesRate?: VesRate | null
  children?: ReactNode
}) {
  const tb = useTranslations('platformFees.payNow.bank')
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="fee-bank-details">
      <p className="font-medium">{tb('title')}</p>
      {accounts.length > 0 ? (
        accounts.map((account) => (
          <div key={account.id} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0" data-testid="fee-bank-block">
            <AccountRows account={account} currency={currency} amount={amount} vesRate={vesRate} />
          </div>
        ))
      ) : (
        <p className="text-muted-foreground" data-testid="fee-bank-fallback">{tb('fallback')}</p>
      )}
      {children}
    </div>
  )
}

/** The payment reference to quote on the transfer, with a copy button. */
export function TransferReference({ value }: { value: string }) {
  const tb = useTranslations('platformFees.payNow.bank')
  const valueId = useId()
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{tb('reference')}</p>
        {/* One token: scroll sideways rather than split it mid-word. */}
        <code id={valueId} className="block overflow-x-auto whitespace-nowrap font-mono text-xs" data-testid="fee-bank-reference">{value}</code>
        <p className="text-xs text-muted-foreground">{tb('referenceHint')}</p>
      </div>
      <CopyButton value={value} label={tb('copyReference')} sourceId={valueId} />
    </div>
  )
}
