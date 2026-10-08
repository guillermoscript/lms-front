'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  MANUAL_KIND_FIELDS,
  isManualPaymentAccountComplete,
  type ManualPaymentAccount,
  type ManualPaymentFieldKey,
} from '@/lib/payments/manual-payment-accounts'

const CUSTOM_ORDER: ManualPaymentFieldKey[] = ['bank', 'identifier', 'email', 'holder', 'document', 'note']

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations('checkout.manual.accounts')
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
      // Clipboard can be blocked (insecure context, permissions): the value is
      // still selectable on screen, so this is a convenience, not a dependency.
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-9 sm:size-7"
        aria-label={t('copyLabel', { field: label })}
        title={copied ? t('copied') : t('copy')}
        onClick={() => void copy()}
      >
        {copied ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('copied') : ''}
      </span>
    </>
  )
}

/**
 * The structured accounts a school accepts offline payments into (#802), shown
 * to the student BEFORE they pay. Until now only the free-text instructions
 * were visible here; the accounts surfaced as a dropdown label after the
 * request already existed.
 *
 * Preset rows render exactly the fields their method asks for; legacy / custom
 * rows render whichever of the original fields they filled in. A preset whose
 * required fields are still empty is saved by the admin but hidden here — a
 * half-configured "Zelle" with no email is noise, not a payment option.
 */
export function ManualPaymentAccountsList({
  accounts,
  className = 'mt-8',
}: {
  accounts: ManualPaymentAccount[]
  className?: string
}) {
  const t = useTranslations('checkout.manual.accounts')
  const visible = accounts.filter(isManualPaymentAccountComplete)
  if (visible.length === 0) return null

  const label = (account: ManualPaymentAccount, key: ManualPaymentFieldKey) => {
    // Two presets reuse a generic column for something more specific.
    if (account.kind === 'binance' && key === 'identifier') return t('fields.binancePayId')
    if (account.kind === 'pago_movil' && key === 'identifier') return t('fields.phone')
    return t(`fields.${key}`)
  }

  return (
    <div className={`${className} space-y-3`} data-testid="manual-accounts-list">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <ul className="space-y-3">
        {visible.map((account) => {
          const keys = account.kind ? MANUAL_KIND_FIELDS[account.kind].map((s) => s.key) : CUSTOM_ORDER
          const rows = keys.filter((key) => account[key])
          return (
            <li key={account.id} className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium">{account.method}</p>
              {rows.length > 0 && (
                <dl className="mt-2 space-y-1.5 text-sm">
                  {rows.map((key) => {
                    const value = account[key] as string
                    return (
                      <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-2">
                        <dt className="shrink-0 text-muted-foreground sm:w-32">{label(account, key)}</dt>
                        <dd className="flex min-w-0 flex-1 items-start gap-1">
                          <span
                            className={
                              key === 'note'
                                ? 'min-w-0 whitespace-pre-wrap break-words'
                                : 'min-w-0 break-words font-medium'
                            }
                          >
                            {value}
                          </span>
                          {key !== 'note' && (
                            <CopyButton value={value} label={label(account, key)} />
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
