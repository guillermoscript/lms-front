'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconPlus } from '@tabler/icons-react'
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
  savePlatformBankAccountAction,
  setPlatformBankAccountActiveAction,
  type BankAccountActionError,
} from '@/app/actions/platform/bank-accounts'
import { parseBankAccountInput, type BankAccountField } from '@/lib/billing/platform-bank-account-input'
import type { PlatformBankAccount } from '@/lib/billing/platform-bank-accounts'

const ERRORS: readonly BankAccountActionError[] = ['forbidden', 'invalid', 'invalid_id', 'not_found', 'duplicate_currency', 'internal']
const errorKey = (code: unknown) => (ERRORS as readonly unknown[]).includes(code) ? (code as string) : 'generic'

type FormState = {
  currency: string
  label: string
  bankName: string
  accountHolder: string
  accountNumber: string
  accountType: string
  routingNumber: string
  swiftCode: string
  extraInstructions: string
  sortOrder: string
  isActive: boolean
}

function initialState(a: PlatformBankAccount | null): FormState {
  return {
    currency: a?.currency ?? 'USD',
    label: a?.label ?? '',
    bankName: a?.bankName ?? '',
    accountHolder: a?.accountHolder ?? '',
    accountNumber: a?.accountNumber ?? '',
    accountType: a?.accountType ?? '',
    routingNumber: a?.routingNumber ?? '',
    swiftCode: a?.swiftCode ?? '',
    extraInstructions: a?.extraInstructions ?? '',
    sortOrder: String(a?.sortOrder ?? 0),
    isActive: a?.isActive ?? true,
  }
}

type TextField = Exclude<BankAccountField, 'isActive'>
const TEXT_FIELDS: { key: TextField; required: boolean; maxLength: number; className?: string; hint?: boolean; multiline?: boolean; mono?: boolean }[] = [
  { key: 'label', required: true, maxLength: 80, hint: true },
  { key: 'currency', required: true, maxLength: 3, hint: true, mono: true },
  { key: 'bankName', required: true, maxLength: 120 },
  { key: 'accountHolder', required: true, maxLength: 120 },
  { key: 'accountNumber', required: true, maxLength: 64, mono: true },
  { key: 'accountType', required: false, maxLength: 40 },
  { key: 'routingNumber', required: false, maxLength: 40, mono: true },
  { key: 'swiftCode', required: false, maxLength: 14, hint: true, mono: true },
  { key: 'extraInstructions', required: false, maxLength: 1000, multiline: true, className: 'sm:col-span-2' },
  { key: 'sortOrder', required: false, maxLength: 5 },
]

/**
 * The account form. Mounted only while its dialog is open, so every open
 * starts from the saved values with no reset routine.
 */
function BankAccountForm({
  account,
  onSaved,
  onCancel,
}: {
  account: PlatformBankAccount | null
  onSaved: () => void
  onCancel: () => void
}) {
  const t = useTranslations('platform.bankAccounts')
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [form, setForm] = useState<FormState>(() => initialState(account))
  const [invalid, setInvalid] = useState<Set<BankAccountField>>(() => new Set())
  const [formError, setFormError] = useState<string | null>(null)
  const idPrefix = `bank-${account?.id ?? 'new'}`

  async function save() {
    const raw = { ...form, sortOrder: form.sortOrder.trim() === '' ? 0 : form.sortOrder }
    const local = parseBankAccountInput(raw)
    if (!local.ok) {
      setInvalid(new Set(local.fields))
      setFormError(t('errors.invalid'))
      return
    }
    setPending(true)
    setFormError(null)
    try {
      const result = await savePlatformBankAccountAction(account?.id ?? null, raw)
      if (!result.ok) {
        setInvalid(new Set(result.fields ?? []))
        setFormError(t(`errors.${errorKey(result.error)}`))
        return
      }
      toast.success(t('saved'))
      onSaved()
      router.refresh()
    } catch {
      setFormError(t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {TEXT_FIELDS.map((f) => {
        const id = `${idPrefix}-${f.key}`
        const isInvalid = invalid.has(f.key)
        const describedBy = [f.hint && !isInvalid ? `${id}-hint` : null, isInvalid ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
        const common = {
          id,
          name: f.key,
          value: form[f.key],
          maxLength: f.maxLength,
          required: f.required,
          'aria-invalid': isInvalid || undefined,
          'aria-describedby': describedBy,
          'data-testid': `bank-account-${f.key}`,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            let value = e.target.value
            if (f.key === 'currency') value = value.toUpperCase().replace(/[^A-Z]/g, '')
            setForm((p) => ({ ...p, [f.key]: value }))
          },
        }
        return (
          <div key={f.key} className={`space-y-1.5 ${f.className ?? ''}`}>
            <Label htmlFor={id}>
              {t(`fields.${f.key}`)}
              {f.required ? null : <span className="font-normal text-muted-foreground"> ({t('optional')})</span>}
            </Label>
            {f.multiline ? (
              <Textarea rows={3} {...common} />
            ) : (
              <Input
                {...common}
                inputMode={f.key === 'sortOrder' ? 'numeric' : undefined}
                autoComplete="off"
                className={f.mono ? 'font-mono' : undefined}
              />
            )}
            {f.hint && !isInvalid ? (
              <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                {t(`hints.${f.key}`)}
              </p>
            ) : null}
            {isInvalid ? (
              <p id={`${id}-error`} className="text-xs text-destructive">
                {t(`fieldErrors.${f.key}`)}
              </p>
            ) : null}
          </div>
        )
      })}
      <div className="flex items-start gap-3 sm:col-span-2">
        <input
          id={`${idPrefix}-isActive`}
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          checked={form.isActive}
          onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
          aria-describedby={`${idPrefix}-isActive-hint`}
          data-testid="bank-account-isActive"
        />
        <div>
          <Label htmlFor={`${idPrefix}-isActive`}>{t('fields.isActive')}</Label>
          <p id={`${idPrefix}-isActive-hint`} className="text-xs text-muted-foreground">
            {t('hints.isActive')}
          </p>
        </div>
      </div>
      {formError ? (
        <p className="text-sm text-destructive sm:col-span-2" role="alert" data-testid="bank-account-error">
          {formError}
        </p>
      ) : null}
      <DialogFooter className="sm:col-span-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending} data-testid="bank-account-save">
          {pending ? t('saving') : t('save')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Dialog chrome shared by both variants; the form is its child. */
function BankAccountDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
}) {
  const t = useTranslations('platform.bankAccounts')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="bank-account-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('formDescription')}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Variant: create a new account. */
export function AddBankAccountDialog() {
  const t = useTranslations('platform.bankAccounts')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="bank-account-add-btn">
        <IconPlus aria-hidden="true" />
        {t('add')}
      </Button>
      <BankAccountDialog open={open} onOpenChange={setOpen} title={t('createTitle')}>
        <BankAccountForm account={null} onSaved={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </BankAccountDialog>
    </>
  )
}

/** Variant: edit an existing account. */
export function EditBankAccountDialog({ account }: { account: PlatformBankAccount }) {
  const t = useTranslations('platform.bankAccounts')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="bank-account-edit-btn">
        {t('edit')}
      </Button>
      <BankAccountDialog open={open} onOpenChange={setOpen} title={t('editTitle')}>
        <BankAccountForm account={account} onSaved={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </BankAccountDialog>
    </>
  )
}

/** Activate directly; deactivate after a confirmation (schools stop seeing it at once). */
export function BankAccountActiveButton({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations('platform.bankAccounts')
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function apply(next: boolean) {
    setPending(true)
    try {
      const result = await setPlatformBankAccountActiveAction(id, next)
      if (!result.ok) {
        toast.error(t(`errors.${errorKey(result.error)}`))
        return
      }
      toast.success(next ? t('activated') : t('deactivated'))
      setConfirming(false)
      router.refresh()
    } catch {
      toast.error(t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  if (!active) {
    return (
      <Button size="sm" variant="outline" onClick={() => void apply(true)} disabled={pending} data-testid="bank-account-activate-btn">
        {t('activate')}
      </Button>
    )
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} data-testid="bank-account-deactivate-btn">
        {t('deactivate')}
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent data-testid="bank-account-deactivate-dialog">
          <DialogHeader>
            <DialogTitle>{t('deactivateTitle')}</DialogTitle>
            <DialogDescription>{t('deactivateBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void apply(false)} disabled={pending} data-testid="bank-account-deactivate-confirm">
              {pending ? t('saving') : t('deactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
