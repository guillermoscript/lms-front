'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLocale, useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/currency'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { getManualPaymentAccounts, getManualPaymentInstructions } from '@/app/actions/admin/settings'
import type { ManualPaymentAccount } from '@/lib/payments/manual-payment-accounts'
import { ManualPaymentAccountsList } from './manual-payment-accounts-list'
import { PaymentRequestForm } from './payment-request-form'

interface ManualPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  productPrice: number
  productCurrency: string
  productId?: number
  planId?: number
}

export function ManualPaymentDialog({
  open,
  onOpenChange,
  productName,
  productPrice,
  productCurrency,
  productId,
  planId,
}: ManualPaymentDialogProps) {
  const t = useTranslations('components.manualPayment')
  const [userName, setUserName] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const [instructions, setInstructions] = useState<string>('')
  const [accounts, setAccounts] = useState<ManualPaymentAccount[]>([])
  const [accountsLoaded, setAccountsLoaded] = useState(false)

  // Load known identity + tenant instructions once the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user && !cancelled) {
          setUserEmail(user.email || '')
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
          if (!cancelled) setUserName(profile?.full_name || '')
        }
      } catch {
        // Non-fatal — the server derives identity anyway.
      }

      try {
        const text = await getManualPaymentInstructions()
        if (!cancelled) setInstructions(text)
      } catch {
        // Non-fatal — instructions are optional.
      }

      try {
        const list = await getManualPaymentAccounts()
        if (!cancelled) setAccounts(list)
      } catch {
        // Non-fatal — the free-text instructions still show.
      } finally {
        if (!cancelled) setAccountsLoaded(true)
      }
    })()

    return () => {
      cancelled = true
      // Don't flash last open's list before the fresh one arrives.
      setAccounts([])
      setAccountsLoaded(false)
    }
  }, [open])

  const locale = useLocale()
  // Formatted in the product's own currency — COP, MXN and BRL are not euros,
  // and zero-decimal currencies carry no cents (#727).
  const amount = formatCurrency(productPrice, productCurrency || 'usd', locale)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t.rich('description', {
              productName: productName,
              amount,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </DialogDescription>
        </DialogHeader>

        {accountsLoaded ? (
          <ManualPaymentAccountsList accounts={accounts} className="mt-2" />
        ) : (
          <div className="mt-2 space-y-2" aria-hidden>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        <PaymentRequestForm
          variant="dialog"
          productId={productId}
          planId={planId}
          productName={productName}
          price={amount}
          currency={productCurrency}
          userName={userName}
          userEmail={userEmail}
          instructions={instructions}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
