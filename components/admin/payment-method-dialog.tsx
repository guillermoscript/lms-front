'use client'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconBuildingBank, IconCoin, IconCreditCard, IconLoader2 } from '@tabler/icons-react'
import { providerLabel } from '@/lib/billing/plan-prices'

/**
 * Rails that move crypto rather than money from a card or a bank (#610). A card
 * icon on a Solana button reads as a promise the flow does not keep — the
 * school is about to be shown a QR, not a card form.
 */
const CRYPTO_RAILS = new Set(['solana', 'binance'])

/**
 * How a school pays the platform for a plan.
 *
 * The upgrade surface used to be binary — one button for Stripe, one for a bank
 * wire — which made every other provider unreachable however many price rows a
 * super admin configured (#600/#603). The list here is whatever
 * `platform_plan_prices` actually holds for the plan and interval, plus manual
 * transfer, which needs no price row because it carries its own amount snapshot.
 *
 * Manual is offered unconditionally, including to a school that already pays by
 * card. That is the case it matters most in: when the card starts failing, the
 * method the school needs is exactly the one the old UI removed.
 */
export interface PaymentMethodTarget {
  planId: string
  planName: string
  interval: 'monthly' | 'yearly'
  /** Provider slugs with an active price row for this plan + interval. */
  providers: string[]
}

interface PaymentMethodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: PaymentMethodTarget | null
  /** The provider the school's live subscription is on, if any. */
  activeProvider?: string | null
  loading?: boolean
  /** Chosen an automatic provider — start a hosted checkout. */
  onSelectProvider: (provider: string) => void
  /** Chosen to settle out of band — open the transfer form. */
  onSelectManual: () => void
}

export function PaymentMethodDialog({
  open,
  onOpenChange,
  target,
  activeProvider,
  loading = false,
  onSelectProvider,
  onSelectManual,
}: PaymentMethodDialogProps) {
  const providers = target?.providers ?? []
  const switchingFrom = activeProvider && activeProvider !== 'manual' ? activeProvider : null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>How would you like to pay?</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `${target.planName}, billed ${target.interval === 'yearly' ? 'yearly' : 'monthly'}.`
              : ''}
            {switchingFrom
              ? ` Your current ${providerLabel(switchingFrom)} subscription is cancelled when the new one starts, so you are never billed twice.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/*
          `min-w-0` is load-bearing: the dialog panel sizes to its content, and
          Button carries `whitespace-nowrap`, so the bank-transfer description
          would otherwise set a one-line intrinsic width and push every option
          out past the panel's right edge.
        */}
        <div className="flex w-full min-w-0 flex-col gap-2">
          {providers.map((provider) => (
            <Button
              key={provider}
              variant="outline"
              className="h-auto w-full min-w-0 justify-start gap-3 whitespace-normal py-3 text-left"
              disabled={loading}
              onClick={() => onSelectProvider(provider)}
            >
              {loading ? (
                <IconLoader2 aria-hidden className="size-5 shrink-0 animate-spin" />
              ) : CRYPTO_RAILS.has(provider) ? (
                <IconCoin aria-hidden className="size-5 shrink-0 text-primary" />
              ) : (
                <IconCreditCard aria-hidden className="size-5 shrink-0 text-primary" />
              )}
              <span className="min-w-0 flex-1 text-left font-medium">{providerLabel(provider)}</span>
              {provider === activeProvider && <Badge variant="secondary">Current method</Badge>}
            </Button>
          ))}

          <Button
            variant="outline"
            className="h-auto w-full min-w-0 justify-start gap-3 whitespace-normal py-3 text-left"
            disabled={loading}
            onClick={onSelectManual}
          >
            <IconBuildingBank aria-hidden className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block font-medium">Bank transfer</span>
              <span className="block text-xs text-muted-foreground">
                We send payment instructions and activate the plan once the transfer lands.
              </span>
            </span>
            {activeProvider === 'manual' && <Badge variant="secondary">Current method</Badge>}
          </Button>

          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No automatic payment method is configured for this plan yet — bank transfer is the way
              to pay for it today.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
