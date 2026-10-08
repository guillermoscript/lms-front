'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  IconBrandPaypal,
  IconBuildingBank,
  IconCash,
  IconCheck,
  IconCoinBitcoin,
  IconDeviceMobile,
  IconPlus,
  IconWallet,
  type Icon,
} from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import ManualPaymentMethodDialog, {
  type BinanceAutoVerifyChange,
  type BinanceAutoVerifyState,
} from '@/components/admin/manual-payment-method-dialog'
import {
  MANUAL_PAYMENT_KINDS,
  MAX_ACCOUNTS,
  blankPresetAccount,
  findPresetAccount,
  isManualPaymentAccountComplete,
  manualPaymentAccountLabel,
  type ManualPaymentAccount,
  type ManualPaymentKind,
} from '@/lib/payments/manual-payment-accounts'

const KIND_ICONS: Record<ManualPaymentKind, Icon> = {
  zelle: IconBuildingBank,
  binance: IconCoinBitcoin,
  paypal: IconBrandPaypal,
  zinli: IconWallet,
  cash: IconCash,
  pago_movil: IconDeviceMobile,
}

/** A fresh free-text row. The id only has to be stable within this school's list. */
function blankCustomAccount(): ManualPaymentAccount {
  return {
    id: `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind: null,
    method: '',
    bank: null,
    identifier: null,
    email: null,
    holder: null,
    document: null,
    note: null,
  }
}

interface ManualPaymentAccountsEditorProps {
  accounts: ManualPaymentAccount[]
  onChange: (accounts: ManualPaymentAccount[]) => void
  disabled?: boolean
  binance: BinanceAutoVerifyState
  onBinanceChange: (change: BinanceAutoVerifyChange) => void
}

/**
 * Where the school's offline money actually lands (#802).
 *
 * A catalog of the methods schools in this market actually take — each a card
 * that opens a small per-method form — instead of six anonymous text boxes. A
 * Zelle account is an email and a name; a Pago Móvil one is a bank, a phone and
 * a cédula; asking for the right thing per method is the whole point. Anything
 * the catalog does not cover (and every row saved before it existed) lives
 * under "Other accounts" with the original free-text fields.
 *
 * The list is controlled and only saved with the settings form. The one
 * exception is the Binance read-only API key, which goes straight to its own
 * encrypted store and never touches this list.
 */
export default function ManualPaymentAccountsEditor({
  accounts,
  onChange,
  disabled,
  binance,
  onBinanceChange,
}: ManualPaymentAccountsEditorProps) {
  const t = useTranslations('dashboard.admin.settings.form.payment.accounts')
  const [target, setTarget] = useState<{
    kind: ManualPaymentKind | null
    account: ManualPaymentAccount
  } | null>(null)

  const customAccounts = accounts.filter((a) => !a.kind)
  const atLimit = accounts.length >= MAX_ACCOUNTS
  const binanceRailReady = Boolean(binance.payId && binance.hasCredentials && binance.enabled)

  const openPreset = (kind: ManualPaymentKind) =>
    setTarget({
      kind,
      account: findPresetAccount(accounts, kind) ?? blankPresetAccount(kind),
    })

  const upsert = (account: ManualPaymentAccount) => {
    const exists = accounts.some((a) => a.id === account.id)
    onChange(exists ? accounts.map((a) => (a.id === account.id ? account : a)) : [...accounts, account])
    setTarget(null)
  }

  const remove = (account: ManualPaymentAccount) => {
    onChange(accounts.filter((a) => a.id !== account.id))
    setTarget(null)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-0.5">
        <Label className="text-sm">{t('title')}</Label>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {MANUAL_PAYMENT_KINDS.map((kind) => {
          const saved = findPresetAccount(accounts, kind)
          // Binance can be "configured" through the auto-verify rail alone, on
          // schools that set it up before this catalog existed.
          const configured =
            (saved ? isManualPaymentAccountComplete(saved) : false) ||
            (kind === 'binance' && binanceRailReady)
          const KindIcon = KIND_ICONS[kind]
          return (
            <li
              key={kind}
              className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
              data-testid={`manual-method-${kind}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <KindIcon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{t(`kinds.${kind}.name`)}</p>
                    {configured && (
                      <Badge variant="secondary" className="gap-1">
                        <IconCheck aria-hidden />
                        {t('configured')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {saved && configured
                      ? manualPaymentAccountLabel(saved)
                      : t(`kinds.${kind}.description`)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || (!saved && atLimit)}
                  onClick={() => openPreset(kind)}
                >
                  {configured ? t('edit') : t('configure')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="space-y-2 pt-1">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('other.title')}
          </p>
          <p className="text-xs text-muted-foreground">{t('other.hint')}</p>
        </div>

        {customAccounts.length > 0 && (
          <ul className="space-y-2">
            {customAccounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <p className="min-w-0 truncate text-sm">{manualPaymentAccountLabel(account)}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setTarget({ kind: null, account })}
                >
                  {t('edit')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || atLimit}
          onClick={() => setTarget({ kind: null, account: blankCustomAccount() })}
        >
          <IconPlus className="h-3.5 w-3.5" />
          {t('other.add')}
        </Button>
        {atLimit && (
          <p className="text-xs text-muted-foreground">{t('limitReached', { max: MAX_ACCOUNTS })}</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t('unsavedHint')}</p>

      <ManualPaymentMethodDialog
        target={target}
        isExisting={Boolean(target && accounts.some((a) => a.id === target.account.id))}
        onClose={() => setTarget(null)}
        onSave={upsert}
        onRemove={remove}
        binance={binance}
        onBinanceChange={onBinanceChange}
      />
    </div>
  )
}
