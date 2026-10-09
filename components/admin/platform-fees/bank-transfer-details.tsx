'use client'

import { useId, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { PlatformBankAccountView } from '@/lib/billing/platform-bank-accounts'
import { CopyButton } from './copy-button'

type BankField = 'bankName' | 'accountHolder' | 'accountNumber' | 'accountType' | 'routingNumber' | 'swiftCode'

/** Row order and which values are worth a copy button. Labels are UI-owned (en/es), never data. */
const BANK_FIELDS: readonly { key: BankField; copy: boolean; mono: boolean }[] = [
  { key: 'bankName', copy: false, mono: false },
  { key: 'accountHolder', copy: true, mono: false },
  { key: 'accountNumber', copy: true, mono: true },
  { key: 'accountType', copy: false, mono: false },
  { key: 'routingNumber', copy: true, mono: true },
  { key: 'swiftCode', copy: true, mono: true },
]

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

function AccountRows({ account, currency }: { account: PlatformBankAccountView; currency: string }) {
  const tb = useTranslations('platformFees.payNow.bank')
  return (
    <>
      <p className="text-xs font-medium">{account.label}</p>
      <dl className="space-y-1.5" data-testid="fee-bank-account">
        {BANK_FIELDS.map(({ key, copy, mono }) => {
          const value = account[key]
          return value ? (
            <div key={key} data-testid={`fee-bank-${key}`}>
              <DetailRow label={tb(`fields.${key}`)} value={value} mono={mono} copy={copy} />
            </div>
          ) : null
        })}
        <div>
          <dt className="text-xs text-muted-foreground">{tb('fields.currency')}</dt>
          <dd data-testid="fee-bank-currency">{account.currency}</dd>
        </div>
        {account.extraInstructions ? (
          <div>
            <dt className="text-xs text-muted-foreground">{tb('fields.extraInstructions')}</dt>
            <dd className="whitespace-pre-wrap break-words">{account.extraInstructions}</dd>
          </div>
        ) : null}
      </dl>
      {account.currency !== currency ? (
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
  children,
}: {
  accounts: readonly PlatformBankAccountView[]
  /** The balance currency being paid (a USD fallback account says so). */
  currency: string
  children?: ReactNode
}) {
  const tb = useTranslations('platformFees.payNow.bank')
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="fee-bank-details">
      <p className="font-medium">{tb('title')}</p>
      {accounts.length > 0 ? (
        accounts.map((account) => (
          <div key={account.id} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0" data-testid="fee-bank-block">
            <AccountRows account={account} currency={currency} />
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
