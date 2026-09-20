'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from 'next-intl'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { ManualPaymentAccount } from '@/lib/payments/manual-payment-accounts'

interface ManualPaymentAccountsEditorProps {
  accounts: ManualPaymentAccount[]
  onChange: (accounts: ManualPaymentAccount[]) => void
  disabled?: boolean
}

/** A fresh row. The id only has to be stable within this school's list. */
function blankAccount(): ManualPaymentAccount {
  return {
    id: `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    method: '',
    bank: null,
    identifier: null,
    holder: null,
    document: null,
    note: null,
  }
}

/**
 * Where the school's offline money actually lands (#802).
 *
 * Deliberately six plain fields rather than a per-rail form: the set of things a
 * transfer needs is different in every country (a Pago Móvil wants a phone and a
 * cédula, a Zelle wants an email, a wire wants an account number), and guessing
 * at that list per method would fit Venezuela and break everywhere else. The
 * school labels the method in its own words and fills only what applies.
 */
export default function ManualPaymentAccountsEditor({
  accounts,
  onChange,
  disabled,
}: ManualPaymentAccountsEditorProps) {
  const t = useTranslations('dashboard.admin.settings.form.payment.accounts')

  const update = (index: number, patch: Partial<ManualPaymentAccount>) => {
    onChange(accounts.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  const field = (
    index: number,
    key: 'method' | 'bank' | 'identifier' | 'holder' | 'document',
    required = false,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`account-${index}-${key}`} className="text-xs font-medium">
        {t(`fields.${key}`)}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        id={`account-${index}-${key}`}
        value={accounts[index][key] ?? ''}
        onChange={(e) => update(index, { [key]: e.target.value })}
        placeholder={t(`placeholders.${key}`)}
        disabled={disabled}
        required={required}
      />
    </div>
  )

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-0.5">
        <Label className="text-sm">{t('title')}</Label>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </div>

      {accounts.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {t('empty')}
        </p>
      )}

      <div className="space-y-3">
        {accounts.map((account, index) => (
          <div key={account.id} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('accountNumber', { number: index + 1 })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-destructive"
                disabled={disabled}
                onClick={() => onChange(accounts.filter((_, i) => i !== index))}
              >
                <IconTrash className="h-3.5 w-3.5" />
                {t('remove')}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {field(index, 'method', true)}
              {field(index, 'bank')}
              {field(index, 'identifier')}
              {field(index, 'holder')}
              {field(index, 'document')}
              <div className="space-y-1.5">
                <Label htmlFor={`account-${index}-note`} className="text-xs font-medium">
                  {t('fields.note')}
                </Label>
                <Input
                  id={`account-${index}-note`}
                  value={account.note ?? ''}
                  onChange={(e) => update(index, { note: e.target.value })}
                  placeholder={t('placeholders.note')}
                  disabled={disabled}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={disabled}
        onClick={() => onChange([...accounts, blankAccount()])}
      >
        <IconPlus className="h-3.5 w-3.5" />
        {t('add')}
      </Button>
    </div>
  )
}
