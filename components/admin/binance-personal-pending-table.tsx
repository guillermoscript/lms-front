'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { useParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import {
  confirmBinancePersonalTransaction,
  cancelBinancePersonalTransaction,
  type PendingBinancePersonalTransaction,
} from '@/app/actions/admin/binance-personal'

export function BinancePersonalPendingTable({
  transactions,
}: {
  transactions: PendingBinancePersonalTransaction[]
}) {
  const { locale } = useParams()
  const dateLocale = locale === 'es' ? es : enUS
  const t = useTranslations('dashboard.admin.paymentRequests.binancePersonal')
  const router = useRouter()
  const [pendingId, setPendingId] = useState<number | null>(null)
  // Which row+action is awaiting the admin's dialog confirmation.
  const [dialog, setDialog] = useState<{ action: 'confirm' | 'cancel'; transactionId: number } | null>(null)

  const handleConfirm = async (transactionId: number) => {
    setPendingId(transactionId)
    try {
      const result = await confirmBinancePersonalTransaction(transactionId)
      if (result.success) {
        toast.success(t('toasts.confirmSuccess'))
        router.refresh()
      } else {
        toast.error(result.error || t('toasts.confirmError'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toasts.confirmError'))
    } finally {
      setPendingId(null)
    }
  }

  const handleCancel = async (transactionId: number) => {
    setPendingId(transactionId)
    try {
      const result = await cancelBinancePersonalTransaction(transactionId)
      if (result.success) {
        toast.success(t('toasts.cancelSuccess'))
        router.refresh()
      } else {
        toast.error(result.error || t('toasts.cancelError'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toasts.cancelError'))
    } finally {
      setPendingId(null)
    }
  }

  if (transactions.length === 0) {
    return null
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('table.headers.code')}</TableHead>
            <TableHead>{t('table.headers.student')}</TableHead>
            <TableHead>{t('table.headers.amount')}</TableHead>
            <TableHead>{t('table.headers.date')}</TableHead>
            <TableHead className="text-right">{t('table.headers.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => (
            <TableRow key={tx.transaction_id}>
              <TableCell className="font-mono text-sm">#{tx.transaction_id}</TableCell>
              <TableCell>
                <div className="font-medium">{tx.full_name || t('table.unknownStudent')}</div>
              </TableCell>
              <TableCell className="font-medium tabular-nums">
                {(tx.amount ?? 0).toLocaleString(locale as string, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                {(tx.currency || 'USDT').toUpperCase()}
              </TableCell>
              <TableCell>
                {tx.transaction_date ? (
                  <>
                    <div className="text-sm">
                      {format(new Date(tx.transaction_date), 'MMM d, yyyy', { locale: dateLocale })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(tx.transaction_date), 'h:mm a', { locale: dateLocale })}
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingId === tx.transaction_id}
                    onClick={() => setDialog({ action: 'cancel', transactionId: tx.transaction_id })}
                  >
                    {t('table.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={pendingId === tx.transaction_id}
                    onClick={() => setDialog({ action: 'confirm', transactionId: tx.transaction_id })}
                  >
                    {t('table.confirm')}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.action === 'cancel' ? t('table.cancel') : t('table.confirm')}
        description={dialog?.action === 'cancel' ? t('confirmations.cancel') : t('confirmations.confirm')}
        confirmText={dialog?.action === 'cancel' ? t('table.cancel') : t('table.confirm')}
        variant={dialog?.action === 'cancel' ? 'destructive' : 'default'}
        onConfirm={() => {
          if (!dialog) return
          const { action, transactionId } = dialog
          setDialog(null)
          if (action === 'cancel') void handleCancel(transactionId)
          else void handleConfirm(transactionId)
        }}
      />
    </div>
  )
}
