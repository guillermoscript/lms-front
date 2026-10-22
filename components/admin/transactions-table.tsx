'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DataTableRoot } from '@/components/niko-table/core/data-table-root'
import { DataTable } from '@/components/niko-table/core/data-table'
import {
  DataTableHeader,
  DataTableBody,
  DataTableEmptyBody,
} from '@/components/niko-table/core/data-table-structure'
import { DataTableToolbarSection } from '@/components/niko-table/components/data-table-toolbar-section'
import { DataTableSearchFilter } from '@/components/niko-table/components/data-table-search-filter'
import { DataTableFacetedFilter } from '@/components/niko-table/components/data-table-faceted-filter'
import { DataTableClearFilter } from '@/components/niko-table/components/data-table-clear-filter'
import { DataTablePagination } from '@/components/niko-table/components/data-table-pagination'
import { DataTableColumnHeader } from '@/components/niko-table/components/data-table-column-header'
import { DataTableColumnTitle } from '@/components/niko-table/components/data-table-column-title'
import { DataTableColumnSortMenu } from '@/components/niko-table/components/data-table-column-sort'
import {
  DataTableEmptyIcon,
  DataTableEmptyMessage,
  DataTableEmptyTitle,
  DataTableEmptyDescription,
  DataTableEmptyFilteredMessage,
} from '@/components/niko-table/components/data-table-empty-state'
import type { DataTableColumnDef } from '@/components/niko-table/types'
import { IconCheck, IconClock, IconCurrencyDollar, IconX } from '@tabler/icons-react'

export interface TransactionRow {
  id: string
  userName: string | null
  amount: number
  status: string
  method: string | null
  date: string
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

const STATUSES = ['successful', 'pending', 'failed', 'canceled', 'refunded', 'archived']

export function TransactionsTable({ transactions }: { transactions: TransactionRow[] }) {
  const t = useTranslations('dashboard.admin.transactions')
  const tm = useTranslations('dashboard.admin.main')
  const locale = useLocale()
  const dateLocale = locale === 'es' ? es : enUS

  const rows = useMemo(
    () =>
      transactions.map((tx) => ({
        ...tx,
        userName: tx.userName || t('table.unknown'),
        method: tx.method || 'na',
      })),
    [transactions, t],
  )

  const methodLabel = useMemo(
    () => (m: string) => {
      if (m === 'na') return t('table.notAvailable')
      return t.has(`table.methods.${m}`) ? t(`table.methods.${m}`) : m
    },
    [t],
  )

  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }),
    [locale],
  )

  const columns = useMemo<DataTableColumnDef<(typeof rows)[number]>[]>(
    () => [
      {
        id: 'id',
        accessorKey: 'id',
        header: sortHeader,
        meta: { label: t('table.headers.id') },
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
            {row.original.id}
          </code>
        ),
      },
      {
        id: 'userName',
        accessorKey: 'userName',
        header: sortHeader,
        meta: { label: t('table.headers.user') },
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(row.original.userName)}</AvatarFallback>
            </Avatar>
            <p className="font-medium">{row.original.userName}</p>
          </div>
        ),
      },
      {
        id: 'amount',
        accessorKey: 'amount',
        header: sortHeader,
        meta: { label: t('table.headers.amount'), variant: 'number' },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">{currency.format(row.original.amount)}</span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('table.headers.status') },
        cell: ({ row }) => {
          const status = row.original.status
          return (
            <Badge
              variant={
                status === 'successful'
                  ? 'default'
                  : status === 'pending' || status === 'archived' || status === 'refunded'
                    ? 'secondary'
                    : 'destructive'
              }
              className={`text-[10px] ${status === 'successful' ? 'bg-success/10 text-success border-success/30' : status === 'pending' ? 'bg-warning/10 text-warning border-warning/30' : ''}`}
            >
              {status === 'successful' && <IconCheck className="mr-1 h-3 w-3" />}
              {status === 'pending' && <IconClock className="mr-1 h-3 w-3" />}
              {(status === 'failed' || status === 'canceled') && <IconX className="mr-1 h-3 w-3" />}
              {tm(`recentActivity.status.${status}`)}
            </Badge>
          )
        },
      },
      {
        id: 'method',
        accessorKey: 'method',
        header: sortHeader,
        meta: { label: t('table.headers.method') },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{methodLabel(row.original.method)}</span>
        ),
      },
      {
        id: 'date',
        accessorKey: 'date',
        header: sortHeader,
        meta: { label: t('table.headers.date'), variant: 'date' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {format(new Date(row.original.date), locale === 'es' ? 'd MMM yyyy HH:mm' : 'MMM d, yyyy HH:mm', { locale: dateLocale })}
          </span>
        ),
      },
    ],
    [t, tm, currency, methodLabel, dateLocale, locale],
  )

  const statusOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.status))
    return [...STATUSES, ...[...present].filter((s) => !STATUSES.includes(s))]
      .filter((s) => present.has(s))
      .map((s) => ({ value: s, label: tm(`recentActivity.status.${s}`) }))
  }, [rows, tm])

  const methodOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.method))].sort().map((m) => ({
        value: m,
        label: methodLabel(m),
      })),
    [rows, methodLabel],
  )

  return (
    <DataTableRoot
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      config={{ initialPageSize: 25 }}
    >
      <DataTableToolbarSection className="mb-4 flex-wrap">
        <DataTableSearchFilter placeholder={t('table.searchPlaceholder')} className="max-w-md" />
        <DataTableFacetedFilter
          accessorKey="status"
          title={t('table.headers.status')}
          options={statusOptions}
          multiple
        />
        <DataTableFacetedFilter
          accessorKey="method"
          title={t('table.headers.method')}
          options={methodOptions}
          multiple
        />
        <DataTableClearFilter />
      </DataTableToolbarSection>
      <DataTable>
        <DataTableHeader />
        <DataTableBody>
          <DataTableEmptyBody>
            <DataTableEmptyIcon>
              <IconCurrencyDollar className="h-8 w-8" />
            </DataTableEmptyIcon>
            <DataTableEmptyMessage>
              <DataTableEmptyTitle>{t('table.empty')}</DataTableEmptyTitle>
              <DataTableEmptyDescription>{t('description')}</DataTableEmptyDescription>
            </DataTableEmptyMessage>
            <DataTableEmptyFilteredMessage>{t('table.empty')}</DataTableEmptyFilteredMessage>
          </DataTableEmptyBody>
        </DataTableBody>
      </DataTable>
      <DataTablePagination defaultPageSize={25} />
    </DataTableRoot>
  )
}
