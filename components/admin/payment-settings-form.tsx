'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { updateSettings } from '@/app/actions/admin/settings'
import type { SettingsGroup } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { IconInfoCircle } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import PaymentProviderRow from '@/components/admin/payment-provider-row'
import SolanaWalletForm from '@/components/admin/solana-wallet-form'
import BinancePersonalForm from '@/components/admin/binance-personal-form'

interface PaymentSettingsFormProps {
  settings: SettingsGroup
  /** Stripe Connect state — was a page-level banner, now the Stripe row's own. */
  connect: {
    accountId: string | null
    chargesEnabled: boolean
    detailsSubmitted: boolean
    payoutsEnabled: boolean
  }
  solanaWalletAddress: string
  binancePersonal: { payId: string | null; hasCredentials: boolean }
}

export default function PaymentSettingsForm({
  settings,
  connect,
  solanaWalletAddress,
  binancePersonal,
}: PaymentSettingsFormProps) {
  const t = useTranslations('dashboard.admin.settings.form')
  const tConnect = useTranslations('dashboard.admin.settings.sections.payment.connect')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Toggles are controlled rather than read off FormData at submit time: the
  // status pill, the warning state and the expand-on-enable config all have to
  // react the moment the switch moves, not when the form is posted.
  const [flags, setFlags] = useState({
    stripe: settings.stripe_enabled?.value?.enabled ?? true,
    paypal: settings.paypal_enabled?.value?.enabled ?? false,
    lemonsqueezy: settings.lemonsqueezy_enabled?.value?.enabled ?? false,
    binance: settings.binance_enabled?.value?.enabled ?? false,
    binancePersonal: settings.binance_personal_enabled?.value?.enabled ?? false,
    solana: settings.solana_enabled?.value?.enabled ?? false,
    solanaAcceptSol: settings.solana_accept_sol?.value?.enabled ?? false,
    requireApproval: settings.require_payment_approval?.value?.enabled ?? false,
  })
  const setFlag = (key: keyof typeof flags) => (value: boolean) =>
    setFlags((prev) => ({ ...prev, [key]: value }))

  // Credential sheets. The two credential editors are real <form> elements, so
  // they cannot be nested inside this one — a Sheet portals them out of the DOM
  // tree while keeping their trigger inside the provider row that needs them.
  const [walletSheet, setWalletSheet] = useState<null | 'solana' | 'binance_personal'>(null)

  // Settings values are JSONB scalars (string | number | null), so each one is
  // coerced to the shape its input actually wants rather than trusted as-is.
  const currency = String(settings.currency?.value?.value ?? 'USD')
  const taxRate = Number(settings.tax_rate?.value?.value ?? 0)
  const invoicePrefix = String(settings.invoice_prefix?.value?.value ?? 'INV')
  const manualPaymentInstructions = String(
    settings.manual_payment_instructions?.value?.value ?? ''
  )

  // Readiness per rail, mirroring what getEnabledProviders() will actually
  // offer at checkout — a row must never claim "Ready" for a rail the server
  // would refuse. Rails on a global platform account need no tenant setup.
  const stripeReady = Boolean(connect.accountId && connect.chargesEnabled)
  const solanaReady = Boolean(solanaWalletAddress)
  const binancePersonalReady = Boolean(binancePersonal.payId && binancePersonal.hasCredentials)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      const updatedSettings = {
        stripe_enabled: { enabled: flags.stripe },
        paypal_enabled: { enabled: flags.paypal },
        lemonsqueezy_enabled: { enabled: flags.lemonsqueezy },
        binance_enabled: { enabled: flags.binance },
        binance_personal_enabled: { enabled: flags.binancePersonal },
        solana_enabled: { enabled: flags.solana },
        solana_accept_sol: { enabled: flags.solanaAcceptSol },
        currency: { value: formData.get('currency') as string },
        tax_rate: { value: parseFloat(formData.get('tax_rate') as string) },
        invoice_prefix: { value: formData.get('invoice_prefix') as string },
        require_payment_approval: { enabled: flags.requireApproval },
        manual_payment_instructions: {
          value: (formData.get('manual_payment_instructions') as string) || '',
        },
      }

      const result = await updateSettings(updatedSettings)

      if (result.success) {
        toast.success(t('success'))
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  /* Stripe is the one rail with an external onboarding flow, so it is the one
     row that can offer a link instead of an in-app editor. All three Connect
     states now live in the row; none of them can shout at a school that has
     Stripe switched off. */
  const stripeAction = stripeReady ? null : (
    /* eslint-disable-next-line @next/next/no-html-link-for-pages */
    <a
      href="/api/stripe/connect"
      className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      data-testid="stripe-connect-action"
    >
      {!connect.accountId
        ? tConnect('connectButton')
        : connect.detailsSubmitted
          ? tConnect('checkStatusButton')
          : tConnect('resumeButton')}
    </a>
  )

  return (
    <form action={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{t('payment.howStudentsPay')}</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t('payment.howStudentsPayDesc')}
          </p>
        </div>

        {/* ── Cards & wallets ─────────────────────────────────────────── */}
        <ProviderGroup
          title={t('payment.groups.cards')}
          description={t('payment.groups.cardsDesc')}
        >
          <PaymentProviderRow
            provider="stripe"
            name={t('payment.stripe')}
            description={t('payment.stripeHint')}
            enabled={flags.stripe}
            onEnabledChange={setFlag('stripe')}
            configured={stripeReady}
            action={stripeAction}
            setupHint={
              !connect.accountId
                ? t('payment.setup.connect')
                : connect.detailsSubmitted
                  ? tConnect('pendingReviewDesc')
                  : tConnect('pendingDesc')
            }
          >
            {stripeReady && !connect.payoutsEnabled && (
              <p className="text-xs text-muted-foreground">{tConnect('payoutsPending')}</p>
            )}
          </PaymentProviderRow>

          <PaymentProviderRow
            provider="paypal"
            name={t('payment.paypal')}
            description={t('payment.paypalHint')}
            enabled={flags.paypal}
            onEnabledChange={setFlag('paypal')}
            configured
          />

          <PaymentProviderRow
            provider="lemonsqueezy"
            name={t('payment.lemonsqueezy')}
            description={t('payment.lemonsqueezyHint')}
            enabled={flags.lemonsqueezy}
            onEnabledChange={setFlag('lemonsqueezy')}
            configured
          >
            {/* Per-offering setup we cannot verify from here, so it is stated as
                a standing requirement rather than a blocked status. */}
            {flags.lemonsqueezy && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <IconInfoCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('payment.setup.catalog')}
              </p>
            )}
          </PaymentProviderRow>
        </ProviderGroup>

        {/* ── Crypto ──────────────────────────────────────────────────── */}
        <ProviderGroup
          title={t('payment.groups.crypto')}
          description={t('payment.groups.cryptoDesc')}
        >
          <PaymentProviderRow
            provider="solana"
            name={t('payment.solana')}
            description={t('payment.solanaHint')}
            enabled={flags.solana}
            onEnabledChange={setFlag('solana')}
            configured={solanaReady}
            setupHint={t('payment.setup.wallet')}
            action={
              <WalletButton onClick={() => setWalletSheet('solana')}>
                {solanaReady
                  ? t('payment.wallet.edit')
                  : t('payment.wallet.add')}
              </WalletButton>
            }
          >
            {flags.solana && (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="solana_accept_sol" className="text-sm">
                    {t('payment.solanaAcceptSol')}
                  </Label>
                  <p className="max-w-xl text-xs text-muted-foreground">
                    {t('payment.solanaAcceptSolHint')}
                  </p>
                </div>
                <Switch
                  id="solana_accept_sol"
                  checked={flags.solanaAcceptSol}
                  onCheckedChange={setFlag('solanaAcceptSol')}
                />
              </div>
            )}
          </PaymentProviderRow>

          <PaymentProviderRow
            provider="binance"
            name={t('payment.binance')}
            description={t('payment.binanceHint')}
            enabled={flags.binance}
            onEnabledChange={setFlag('binance')}
            configured
          />

          <PaymentProviderRow
            provider="binance_personal"
            name={t('payment.binancePersonal')}
            description={t('payment.binancePersonalHint')}
            enabled={flags.binancePersonal}
            onEnabledChange={setFlag('binancePersonal')}
            configured={binancePersonalReady}
            setupHint={t('payment.setup.wallet')}
            action={
              <WalletButton onClick={() => setWalletSheet('binance_personal')}>
                {binancePersonalReady ? t('payment.wallet.edit') : t('payment.wallet.add')}
              </WalletButton>
            }
          />
        </ProviderGroup>

        {/* ── Offline ─────────────────────────────────────────────────── */}
        <ProviderGroup
          title={t('payment.groups.offline')}
          description={t('payment.groups.offlineDesc')}
        >
          {/* Offline was always live in getEnabledProviders() and had no row at
              all, while its two controls sat in two unrelated places. */}
          <PaymentProviderRow
            provider="manual"
            name={t('payment.manual')}
            description={t('payment.manualHint')}
            enabled
            onEnabledChange={() => {}}
            configured
            locked
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual_payment_instructions" className="text-sm">
                  {t('payment.manualInstructions')}
                </Label>
                <Textarea
                  id="manual_payment_instructions"
                  name="manual_payment_instructions"
                  defaultValue={manualPaymentInstructions}
                  rows={4}
                  placeholder={t('payment.manualInstructionsPlaceholder')}
                  className="max-w-2xl"
                />
                <p className="max-w-2xl text-xs text-muted-foreground">
                  {t('payment.manualInstructionsHint')}
                </p>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="require_payment_approval" className="text-sm">
                    {t('payment.approval')}
                  </Label>
                  <p className="max-w-xl text-xs text-muted-foreground">
                    {t('payment.approvalHint')}
                  </p>
                </div>
                <Switch
                  id="require_payment_approval"
                  checked={flags.requireApproval}
                  onCheckedChange={setFlag('requireApproval')}
                />
              </div>
            </div>
          </PaymentProviderRow>
        </ProviderGroup>

        <p className="flex max-w-2xl items-start gap-1.5 text-xs text-muted-foreground">
          <IconInfoCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('payment.payoutNote')}
        </p>
      </section>

      {/* ── Billing details ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">{t('payment.invoiceSettings')}</h3>

        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="currency">{t('payment.currency')}</Label>
            <Select name="currency" defaultValue={currency}>
              <SelectTrigger id="currency">
                <SelectValue placeholder={t('payment.currencyPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
                <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                <SelectItem value="MXN">MXN - Mexican Peso</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('payment.currencyHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax_rate">{t('payment.taxRate')}</Label>
            <Input
              id="tax_rate"
              name="tax_rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={taxRate}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">{t('payment.taxRateHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice_prefix">{t('payment.invoicePrefix')}</Label>
            <Input
              id="invoice_prefix"
              name="invoice_prefix"
              defaultValue={invoicePrefix}
              placeholder="INV"
              required
            />
            <p className="text-xs text-muted-foreground">{t('payment.invoicePrefixHint')}</p>
          </div>
        </div>
      </section>

      {/* One save for everything this form owns. The two credential editors
          save themselves from inside their sheets, which is why they are not
          competing save buttons on the page any more. */}
      <div className="sticky bottom-0 -mx-4 flex justify-end border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? t('saving') : t('saveChanges')}
        </Button>
      </div>

      <Sheet
        open={walletSheet === 'solana'}
        onOpenChange={(open) => !open && setWalletSheet(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('payment.wallet.solanaTitle')}</SheetTitle>
            <SheetDescription>{t('payment.wallet.solanaDesc')}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <SolanaWalletForm initialAddress={solanaWalletAddress} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={walletSheet === 'binance_personal'}
        onOpenChange={(open) => !open && setWalletSheet(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('payment.wallet.binanceTitle')}</SheetTitle>
            <SheetDescription>{t('payment.wallet.binanceDesc')}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <BinancePersonalForm
              initialPayId={binancePersonal.payId}
              hasCredentials={binancePersonal.hasCredentials}
            />
          </div>
        </SheetContent>
      </Sheet>
    </form>
  )
}

function ProviderGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h4>
        <span className="text-xs text-muted-foreground/70">{description}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

/** type="button" matters: this lives inside the settings <form>. */
function WalletButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center rounded-lg border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      {children}
    </button>
  )
}
