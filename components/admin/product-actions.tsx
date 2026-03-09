'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('dashboard.admin.products.actions')

  const handleArchive = async () => {
    setLoading(true)
    const result = await archiveProduct(productId)

    if (result.success) {
      toast.success(t('archiveSuccess', { name: productName }))
      setShowArchiveDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || t('archiveError'))
    }

    setLoading(false)
  }

  const handleRestore = async () => {
    setLoading(true)
    const result = await restoreProduct(productId)

    if (result.success) {
      toast.success(t('restoreSuccess', { name: productName }))
      setShowRestoreDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || t('restoreError'))
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
        title={t('archiveTitle')}
        description={t('archiveDescription', { name: productName })}
        confirmText={t('archive')}
        variant="destructive"
        onConfirm={handleArchive}
      />

      {/* Restore Confirmation */}
      <ConfirmDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        title={t('restoreTitle')}
        description={t('restoreDescription', { name: productName })}
        confirmText={t('restore')}
        onConfirm={handleRestore}
      />
    </>
  )
}
