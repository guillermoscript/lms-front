'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslations } from 'next-intl'
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

  const currencySymbol = productCurrency === 'usd' ? '$' : '€'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t.rich('description', {
              productName: productName,
              symbol: currencySymbol,
              price: productPrice,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </DialogDescription>
        </DialogHeader>

        <PaymentRequestForm
          variant="dialog"
          productId={productId}
          planId={planId}
          productName={productName}
          price={`${currencySymbol}${productPrice}`}
          currency={productCurrency}
          userName={userName}
          userEmail={userEmail}
          instructions={instructions}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
