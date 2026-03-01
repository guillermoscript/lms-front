'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ManualPaymentDialog } from './manual-payment-dialog'

interface ManualPaymentButtonProps {
  productId: number
  productName: string
  productPrice: number
  productCurrency: string
}

export function ManualPaymentButton({
  productId,
  productName,
  productPrice,
  productCurrency
}: ManualPaymentButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        className="w-full"
        size="lg"
      >
        Request Payment Information
      </Button>

      <ManualPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        productId={productId}
        productName={productName}
        productPrice={productPrice}
        productCurrency={productCurrency}
      />
    </>
  )
}
