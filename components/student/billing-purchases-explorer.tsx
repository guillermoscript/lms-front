'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  IconCheck,
  IconClock,
  IconCoin,
  IconCreditCard,
  IconBrandStripe,
  IconPackage,
  IconRefresh,
  IconWallet,
  IconX,
} from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { VerifyPaymentButton } from '@/components/student/verify-payment-button'
import { ListToolbar, matchesQuery } from '@/components/student/list-toolbar'

export type PurchaseStatus = 'successful' | 'pending' | 'failed' | 'canceled' | 'refunded' | 'archived'

export interface PurchaseRow {
  id: number
  itemName: string | null
  provider: string | null
  date: string
  status: PurchaseStatus
  amount: number
  currency: string | null
}

type StatusFilter = 'all' | PurchaseStatus
type Sort = 'newest' | 'oldest' | 'amountHigh' | 'amountLow'

const STATUSES: PurchaseStatus[] = ['successful', 'pending', 'failed', 'canceled', 'refunded', 'archived']
const SORTS: Sort[] = ['newest', 'oldest', 'amountHigh', 'amountLow']

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr))
}

function statusMeta(status: PurchaseStatus): { icon: React.ReactNode; className: string } {
  switch (status) {
    case 'successful':
      return { icon: <IconCheck className="w-3 h-3" />, className: 'bg-success/10 text-success border-success/30' }
    case 'pending':
      return { icon: <IconClock className="w-3 h-3" />, className: 'bg-warning/10 text-warning border-warning/30' }
    case 'refunded':
      return { icon: <IconRefresh className="w-3 h-3" />, className: 'bg-muted text-muted-foreground border-border' }
    default:
      return { icon: <IconX className="w-3 h-3" />, className: 'bg-destructive/10 text-destructive border-destructive/30' }
  }
}

function ProviderIcon({ provider }: { provider: string | null }) {
  switch (provider) {
    case 'stripe':
      return <IconBrandStripe className="w-3.5 h-3.5 shrink-0" />
    case 'solana':
    case 'solana_subs':
      return <IconWallet className="w-3.5 h-3.5 shrink-0" />
    case 'lemonsqueezy':
      return <IconCoin className="w-3.5 h-3.5 shrink-0" />
    case 'paypal':
      return <IconCreditCard className="w-3.5 h-3.5 shrink-0" />
    default:
      return <IconPackage className="w-3.5 h-3.5 shrink-0" />
  }
}

const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'

/** Search / status filter / sort for the student's purchase history table. */
export function BillingPurchasesExplorer({ rows }: { rows: PurchaseRow[] }) {
  const t = useTranslations('dashboard.student.billing')
  const locale = useLocale()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<Sort>('newest')

  const providerLabel = (p: string | null) =>
    p ? t(`provider.${p}` as Parameters<typeof t>[0]) : '—'
  const itemLabel = (r: PurchaseRow) => r.itemName ?? t('purchases.unknownItem')

  const visible = rows
    .filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        matchesQuery(search, locale, itemLabel(r), r.provider ? providerLabel(r.provider) : null)
    )
    .sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id
        case 'amountHigh':
          return b.amount - a.amount || b.id - a.id
        case 'amountLow':
          return a.amount - b.amount || b.id - a.id
        default:
          return new Date(b.date).getTime() - new Date(a.date).getTime() || b.id - a.id
      }
    })

  const filtered = search !== '' || status !== 'all'
  function reset() {
    setSearch('')
    setStatus('all')
  }

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel={t('purchases.list.search')}
        searchPlaceholder={t('purchases.list.searchPlaceholder')}
        selects={[
          {
            id: 'status',
            label: t('purchases.table.status'),
            value: status,
            options: [
              { value: 'all', label: t('purchases.list.allStatuses') },
              ...STATUSES.map((s) => ({ value: s, label: t(`purchases.status.${s}` as Parameters<typeof t>[0]) })),
            ],
            onChange: (v) => setStatus(v as StatusFilter),
          },
          {
            id: 'sort',
            label: t('purchases.list.sort'),
            value: sort,
            options: SORTS.map((s) => ({ value: s, label: t(`purchases.list.${s}` as Parameters<typeof t>[0]) })),
            onChange: (v) => setSort(v as Sort),
          },
        ]}
        resultsText={t('purchases.list.results', { count: visible.length, total: rows.length })}
        showReset={filtered}
        onReset={reset}
        resetLabel={t('purchases.list.reset')}
      />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">{t('purchases.list.noMatches')}</p>
          <p className="text-sm text-muted-foreground">{t('purchases.list.noMatchesHint')}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            {t('purchases.list.reset')}
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-[620px] w-full text-sm">
            <thead className="bg-muted/20">
              <tr className="border-b">
                <th className={TH}>{t('purchases.table.item')}</th>
                <th className={`${TH} hidden sm:table-cell`}>{t('purchases.table.provider')}</th>
                <th className={`${TH} hidden sm:table-cell`}>{t('purchases.table.date')}</th>
                <th className={TH}>{t('purchases.table.status')}</th>
                <th className={`${TH} text-right`}>{t('purchases.table.amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((tx) => {
                const itemName = itemLabel(tx)
                const meta = statusMeta(tx.status)
                return (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="max-w-[160px] px-4 py-3 align-top font-medium" title={itemName}>
                      <span className="block truncate">{itemName}</span>
                      <p className="mt-1 text-xs font-normal text-muted-foreground sm:hidden">
                        {formatDate(tx.date)}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 align-top sm:table-cell">
                      <span className="flex items-center gap-1 text-muted-foreground text-xs">
                        <ProviderIcon provider={tx.provider} />
                        {providerLabel(tx.provider)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 align-top tabular-nums text-muted-foreground sm:table-cell">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge variant="outline" className={`gap-1 text-xs ${meta.className}`}>
                          {meta.icon}
                          {t(`purchases.status.${tx.status}` as Parameters<typeof t>[0])}
                        </Badge>
                        {tx.status === 'pending' && tx.provider === 'solana' && (
                          <VerifyPaymentButton transactionId={tx.id} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right align-top font-medium tabular-nums">
                      {formatCurrency(tx.amount, tx.currency ?? 'USD')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
