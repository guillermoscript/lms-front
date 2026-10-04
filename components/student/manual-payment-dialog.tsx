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
import { createClient } from '@/lib/supabase/client'
import { getManualPaymentInstructions } from '@/app/actions/admin/settings'
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
    })()

    return () => { cancelled = true }
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
