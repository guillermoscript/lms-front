'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { IconExternalLink, IconFileInvoice } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
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

export interface InvoiceRow {
  id: string
  invoiceNumber: string
  /** Resolved product name, or null when unknown. */
  item: string | null
  amount: number
  currency: string | null
  /** Raw payment_requests.status. */
  rawStatus: string
  createdAt: string | null
  confirmedAt: string | null
}

type StatusGroup = 'paid' | 'pending' | 'cancelled' | 'other'

function statusGroup(status: string): StatusGroup {
  switch (status) {
    case 'approved':
    case 'completed':
      return 'paid'
    case 'pending':
      return 'pending'
    case 'rejected':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'other'
  }
}

type Row = InvoiceRow & { item_: string; status: StatusGroup }

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

export function InvoicesTable({ rows, locale }: { rows: InvoiceRow[]; locale: string }) {
  const t = useTranslations('dashboard.admin.invoices')
  const tpr = useTranslations('dashboard.admin.paymentRequests')
  const dateLocale = locale === 'es' ? es : enUS

  const data = useMemo<Row[]>(
    () =>
      rows.map((r) => ({
        ...r,
        item_: r.item ?? t('table.unknownProduct'),
        status: statusGroup(r.rawStatus),
      })),
    [rows, t],
  )

  const columns = useMemo<DataTableColumnDef<Row>[]>(() => {
    const fmtMoney = (amount: number, currency: string | null) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: (currency || 'USD').toUpperCase(),
      }).format(amount || 0)
    const fmtDate = (iso: string) => format(new Date(iso), locale === 'es' ? 'd MMM yyyy' : 'MMM d, yyyy', { locale: dateLocale })

    return [
      {
        id: 'invoiceNumber',
        accessorKey: 'invoiceNumber',
        header: sortHeader,
        meta: { label: t('table.headers.invoiceNumber') },
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums">
            {row.original.invoiceNumber}
          </code>
        ),
      },
      {
        id: 'item_',
        accessorKey: 'item_',
        header: sortHeader,
        meta: { label: t('table.headers.item') },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.item_}</p>
            {row.original.createdAt && (
              <p className="mt-1 text-xs text-muted-foreground md:hidden">
                {fmtDate(row.original.createdAt)}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'amount',
        accessorKey: 'amount',
        header: sortHeader,
        meta: { label: t('table.headers.amount'), variant: 'number' },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {fmtMoney(row.original.amount, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('table.headers.status') },
        cell: ({ row }) => {
          const { status, rawStatus, confirmedAt } = row.original
          return (
            <div>
              {status === 'paid' ? (
                <Badge className="bg-success/10 text-success border-success/30 text-[10px]">
                  {t('status.paid')}
                </Badge>
              ) : status === 'pending' ? (
                <Badge className="bg-warning/10 text-warning border-warning/30 text-[10px]">
                  {t('status.pending')}
                </Badge>
              ) : status === 'cancelled' ? (
                <Badge variant="destructive" className="text-[10px]">
                  {t('status.cancelled')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {tpr.has(`status.${rawStatus}`) ? tpr(`status.${rawStatus}`) : rawStatus}
                </Badge>
              )}
              {confirmedAt && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(confirmedAt)}</p>
              )}
            </div>
          )
        },
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: sortHeader,
        meta: { label: t('table.headers.date'), variant: 'date' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.createdAt ? fmtDate(row.original.createdAt) : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('table.headers.actions')}</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Link
              href={`/api/invoices/${row.original.invoiceNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-brand-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="hidden sm:inline">{t('table.viewInvoice')}</span>
              <span className="sr-only sm:hidden">{t('table.viewInvoice')}</span>
              <IconExternalLink className="h-3 w-3" strokeWidth={2} />
            </Link>
          </div>
        ),
      },
    ]
  }, [t, tpr, locale, dateLocale])

  const statusOptions = (['paid', 'pending', 'cancelled', 'other'] as const)
    .filter((s) => data.some((r) => r.status === s))
    .map((s) => ({
      value: s,
      label: s === 'other' ? t('table.otherStatus') : t(`status.${s}`),
    }))

  return (
    <DataTableRoot
      data={data}
      columns={columns}
      getRowId={(row) => row.id}
      config={{ initialPageSize: 25 }}
    >
      <DataTableToolbarSection className="mb-4 flex-wrap px-4 pt-4">
        <DataTableSearchFilter placeholder={t('table.searchPlaceholder')} className="max-w-md" />
        <DataTableFacetedFilter
          accessorKey="status"
          title={t('table.headers.status')}
          options={statusOptions}
          multiple
        />
        <DataTableClearFilter />
      </DataTableToolbarSection>
      <div className="px-4">
        <DataTable>
          <DataTableHeader />
          <DataTableBody>
            <DataTableEmptyBody>
              <DataTableEmptyIcon>
                <IconFileInvoice className="h-8 w-8" />
              </DataTableEmptyIcon>
              <DataTableEmptyMessage>
                <DataTableEmptyTitle>{t('empty.title')}</DataTableEmptyTitle>
                <DataTableEmptyDescription>{t('empty.description')}</DataTableEmptyDescription>
              </DataTableEmptyMessage>
              <DataTableEmptyFilteredMessage>{t('empty.title')}</DataTableEmptyFilteredMessage>
            </DataTableEmptyBody>
          </DataTableBody>
        </DataTable>
      </div>
      <div className="px-4 pb-4">
        <DataTablePagination defaultPageSize={25} />
      </div>
    </DataTableRoot>
  )
}
