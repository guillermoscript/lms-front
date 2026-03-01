'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconArchive, IconRestore } from '@tabler/icons-react'
import { ConfirmDialog } from './confirm-dialog'
import { archiveProduct, restoreProduct } from '@/app/actions/admin/products'

interface ProductActionsProps {
  productId: number
  productName: string
  isActive: boolean
}

export function ProductActions({ productId, productName, isActive }: ProductActionsProps) {
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showRestoreDialog, setShowRestoreDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleArchive = async () => {
    setLoading(true)
    const result = await archiveProduct(productId)

    if (result.success) {
      toast.success(`Product "${productName}" archived`)
      setShowArchiveDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to archive product')
    }

    setLoading(false)
  }

  const handleRestore = async () => {
    setLoading(true)
    const result = await restoreProduct(productId)

    if (result.success) {
      toast.success(`Product "${productName}" restored`)
      setShowRestoreDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to restore product')
    }

    setLoading(false)
  }

  return (
    <>
      {isActive ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowArchiveDialog(true)}
          disabled={loading}
        >
          <IconArchive className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRestoreDialog(true)}
          disabled={loading}
        >
          <IconRestore className="h-4 w-4" />
        </Button>
      )}

      {/* Archive Confirmation */}
      <ConfirmDialog
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
        title="Archive Product"
        description={`Are you sure you want to archive "${productName}"? It will no longer be available for purchase.`}
        confirmText="Archive"
        variant="destructive"
        onConfirm={handleArchive}
      />

      {/* Restore Confirmation */}
      <ConfirmDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        title="Restore Product"
        description={`Are you sure you want to restore "${productName}"? It will become available for purchase again.`}
        confirmText="Restore"
        onConfirm={handleRestore}
      />
    </>
  )
}
