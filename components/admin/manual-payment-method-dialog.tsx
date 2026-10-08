'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, ShieldAlert } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  removeBinancePersonalCredentials,
  setBinancePersonalCredentials,
} from '@/app/actions/admin/settings'
import {
  MANUAL_KIND_FIELDS,
  normalizeManualPaymentAccounts,
  type ManualPaymentAccount,
  type ManualPaymentFieldKey,
  type ManualPaymentFieldSpec,
  type ManualPaymentKind,
  type ManualPaymentValidationError,
  validateManualPaymentAccount,
} from '@/lib/payments/manual-payment-accounts'

/** Binance's optional auto-verify rail, whose secrets live outside this blob. */
export interface BinanceAutoVerifyState {
  payId: string | null
  hasCredentials: boolean
  enabled: boolean
}

export interface BinanceAutoVerifyChange {
  enabled: boolean
  payId?: string | null
  hasCredentials?: boolean
}

/** What the free-text "other account" modal asks for. */
const CUSTOM_FIELDS: ManualPaymentFieldSpec[] = [
  { key: 'identifier', required: false },
  { key: 'bank', required: false },
  { key: 'holder', required: false },
  { key: 'document', required: false },
  { key: 'note', required: false, multiline: true },
]

interface ManualPaymentMethodDialogProps {
  /** `null` closes the dialog. `kind: null` is the free-text "other account". */
  target: { kind: ManualPaymentKind | null; account: ManualPaymentAccount } | null
  /** The row already exists in the saved list (shows "Remove"). */
  isExisting: boolean
  onClose: () => void
  onSave: (account: ManualPaymentAccount) => void
  onRemove: (account: ManualPaymentAccount) => void
  binance: BinanceAutoVerifyState
  onBinanceChange: (change: BinanceAutoVerifyChange) => void
}

export default function ManualPaymentMethodDialog(props: ManualPaymentMethodDialogProps) {
  const { target, onClose } = props
  // Lifted so Escape / outside click cannot dismiss the dialog mid-save, which
  // would still commit the staged account to the parent afterwards.
  const [saving, setSaving] = useState(false)
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      {target && (
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {/* Keyed so reopening the same method starts from the saved row, not
              from whatever was typed and cancelled last time. */}
          <DialogBody
            key={target.account.id}
            {...props}
            target={target}
            saving={saving}
            setSaving={setSaving}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}

function DialogBody({
  target,
  isExisting,
  onClose,
  onSave,
  onRemove,
  binance,
  onBinanceChange,
  saving,
  setSaving,
}: ManualPaymentMethodDialogProps & {
  target: NonNullable<ManualPaymentMethodDialogProps['target']>
  saving: boolean
  setSaving: (saving: boolean) => void
}) {
  const t = useTranslations('dashboard.admin.settings.form.payment.accounts')
  const tBinance = useTranslations('dashboard.admin.settings.form.binancePersonal')
  const { kind } = target

  // Everything is staged here and only handed to the parent on Save, so Cancel
  // can never leak a half-typed value into the settings form.
  const [account, setAccount] = useState<ManualPaymentAccount>(() => {
    const base = target.account
    // First open of Binance on a school already using the auto-verify rail:
    // start from the Pay ID it already saved instead of making them retype it.
    return kind === 'binance' && !base.identifier && binance.payId
      ? { ...base, identifier: binance.payId }
      : base
  })
  const [autoVerify, setAutoVerify] = useState(binance.enabled)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [errors, setErrors] = useState<Partial<Record<ManualPaymentFieldKey | 'method' | 'api', string>>>({})
  const [removingKey, setRemovingKey] = useState(false)

  const specs = kind ? MANUAL_KIND_FIELDS[kind] : CUSTOM_FIELDS
  const label = (key: ManualPaymentFieldKey) =>
    kind ? t(`kinds.${kind}.fields.${key}`) : t(`fields.${key}`)
  const placeholder = (key: ManualPaymentFieldKey) =>
    kind ? t(`kinds.${kind}.placeholders.${key}`) : t(`placeholders.${key}`)

  const set = (patch: Partial<ManualPaymentAccount>) => {
    setAccount((prev) => ({ ...prev, ...patch }))
  }

  function validate() {
    const next: typeof errors = {}
    if (!kind && !account.method.trim()) next.method = t('errors.required')
    const messages: Record<ManualPaymentValidationError, string> = {
      required: t('errors.required'),
      email: t('errors.invalidEmail'),
      phone: t('errors.invalidPhone'),
      document: t('errors.invalidDocument'),
    }
    for (const [key, code] of Object.entries(validateManualPaymentAccount(account).errors)) {
      next[key as ManualPaymentFieldKey] = messages[code]
    }
    if (kind === 'binance' && autoVerify) {
      const hasKey = apiKey.trim() !== ''
      const hasSecret = apiSecret.trim() !== ''
      if (hasKey !== hasSecret || (!binance.hasCredentials && !hasKey)) {
        next.api = t('errors.apiCredentials')
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      // Secrets first and on their own server action: the settings form that
      // later saves this row never sees them, and a rejected key must not leave
      // the school believing auto-verify is on.
      if (kind === 'binance') {
        if (autoVerify) {
          const payId = (account.identifier ?? '').trim()
          const result = await setBinancePersonalCredentials(payId, apiKey.trim(), apiSecret.trim())
          if (!result.success) {
            toast.error(tBinance('error'))
            return
          }
          onBinanceChange({ enabled: true, payId, hasCredentials: true })
        } else {
          onBinanceChange({ enabled: false })
        }
      }
      const [clean] = normalizeManualPaymentAccounts([account])
      if (!clean) {
        setErrors({ method: t('errors.required') })
        return
      }
      onSave(clean)
    } catch {
      toast.error(tBinance('error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveKey() {
    setRemovingKey(true)
    try {
      const result = await removeBinancePersonalCredentials()
      if (!result.success) {
        toast.error(t('binanceAuto.removeKeyError'))
        return
      }
      toast.success(t('binanceAuto.keyRemoved'))
      setAutoVerify(false)
      setApiKey('')
      setApiSecret('')
      onBinanceChange({ enabled: false, payId: null, hasCredentials: false })
    } catch {
      toast.error(t('binanceAuto.removeKeyError'))
    } finally {
      setRemovingKey(false)
    }
  }

  // Enter saves from single-line inputs; the dialog is deliberately not a
  // <form> because it renders inside the settings <form> in the React tree and
  // a submit would bubble up into it.
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !saving) {
      e.preventDefault()
      void handleSave()
    }
  }

  const title = kind ? t(`kinds.${kind}.name`) : t('other.dialogTitle')
  const description = kind ? t(`kinds.${kind}.description`) : t('other.dialogDescription')

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {!kind && (
          <FieldShell
            id="pm-method"
            label={t('fields.method')}
            required
            error={errors.method}
          >
            <Input
              id="pm-method"
              value={account.method}
              onChange={(e) => set({ method: e.target.value })}
              onKeyDown={onEnter}
              placeholder={t('placeholders.method')}
              disabled={saving}
              aria-invalid={Boolean(errors.method)}
              autoFocus
            />
          </FieldShell>
        )}

        {specs.map((spec) => (
          <FieldShell
            key={spec.key}
            id={`pm-${spec.key}`}
            label={label(spec.key)}
            required={spec.required}
            error={errors[spec.key]}
          >
            {spec.multiline ? (
              <Textarea
                id={`pm-${spec.key}`}
                value={account[spec.key] ?? ''}
                onChange={(e) => set({ [spec.key]: e.target.value })}
                placeholder={placeholder(spec.key)}
                rows={3}
                disabled={saving}
                aria-invalid={Boolean(errors[spec.key])}
              />
            ) : (
              <Input
                id={`pm-${spec.key}`}
                type={spec.key === 'email' ? 'email' : 'text'}
                inputMode={inputModeFor(kind, spec.key)}
                autoCapitalize={spec.key === 'email' ? 'off' : undefined}
                spellCheck={spec.key === 'email' ? false : undefined}
                value={account[spec.key] ?? ''}
                onChange={(e) => set({ [spec.key]: e.target.value })}
                onKeyDown={onEnter}
                placeholder={placeholder(spec.key)}
                disabled={saving}
                aria-invalid={Boolean(errors[spec.key])}
                autoComplete="off"
              />
            )}
          </FieldShell>
        ))}

        {kind === 'binance' && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="pm-autoverify" className="text-sm">
                  {t('binanceAuto.title')}
                </Label>
                <p className="text-xs text-muted-foreground">{t('binanceAuto.hint')}</p>
              </div>
              <Switch
                id="pm-autoverify"
                checked={autoVerify}
                onCheckedChange={setAutoVerify}
                disabled={saving}
              />
            </div>

            {autoVerify && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{tBinance('keyWarning')}</p>
                </div>
                <FieldShell id="pm-api-key" label={tBinance('apiKeyLabel')}>
                  <Input
                    id="pm-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={onEnter}
                    placeholder={
                      binance.hasCredentials
                        ? tBinance('unchangedPlaceholder')
                        : tBinance('apiKeyPlaceholder')
                    }
                    spellCheck={false}
                    autoComplete="off"
                    disabled={saving}
                    aria-invalid={Boolean(errors.api)}
                  />
                </FieldShell>
                <FieldShell id="pm-api-secret" label={tBinance('apiSecretLabel')} error={errors.api}>
                  <Input
                    id="pm-api-secret"
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    onKeyDown={onEnter}
                    placeholder={
                      binance.hasCredentials
                        ? tBinance('unchangedPlaceholder')
                        : tBinance('apiSecretPlaceholder')
                    }
                    spellCheck={false}
                    autoComplete="off"
                    disabled={saving}
                    aria-invalid={Boolean(errors.api)}
                  />
                </FieldShell>
                {binance.hasCredentials && (
                  <p className="text-xs text-muted-foreground">{tBinance('credentialsSaved')}</p>
                )}
                <p className="text-xs text-muted-foreground">{t('binanceAuto.codeNote')}</p>
              </div>
            )}

            {autoVerify && (
              <p className="text-xs text-muted-foreground">{t('binanceAuto.saveNote')}</p>
            )}

            {binance.hasCredentials && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                {!autoVerify && (
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {t('binanceAuto.offNote')}
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={saving || removingKey}
                  onClick={() => void handleRemoveKey()}
                >
                  {removingKey && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {t('binanceAuto.removeKey')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <DialogFooter className={isExisting ? 'gap-2 sm:justify-between' : 'gap-2'}>
        {isExisting && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={saving}
            onClick={() => {
              // Removing Binance also stops advertising the auto-verify rail
              // built on the same Pay ID; the stored credentials stay encrypted.
              if (kind === 'binance') onBinanceChange({ enabled: false })
              onRemove(target.account)
            }}
          >
            {t('remove')}
          </Button>
        )}
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={saving}
            onClick={onClose}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function inputModeFor(
  kind: ManualPaymentKind | null,
  key: ManualPaymentFieldKey,
): 'tel' | 'numeric' | undefined {
  if (key === 'identifier' && kind === 'pago_movil') return 'tel'
  if (key === 'identifier' && kind === 'binance') return 'numeric'
  return undefined
}

function FieldShell({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
