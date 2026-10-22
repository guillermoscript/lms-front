'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { IconReceipt } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/payments/format-money'
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

export type EarningsDisplayStatus = 'successful' | 'partiallyRefunded' | 'pending' | 'refunded'

export interface EarningsTableRow {
  transactionId: number
  /** Product / plan name, or `#id` when neither resolves. */
  label: string
  /** ISO timestamp. */
  transactionDate: string
  /** `yyyy-mm` (UTC), drives the month facet. */
  month: string
  /** Raw provider key, rendered through `providerLabel`. */
  paymentProvider: string
  providerLabel: string
  collectedBy: 'school' | 'platform'
  currencyCode: string
  kept: number
  commission: number
  net: number
  fxRateToUsd: number | null
  fxRateSource: string | null
  status: EarningsDisplayStatus
}

export interface EarningsInitialFilters {
  status?: EarningsDisplayStatus[]
  collectedBy?: ('school' | 'platform')[]
  currencyCode?: string[]
}

/** Dates are rendered in UTC, the same zone every boundary on the earnings page uses. */
function formatUtcDate(iso: string, locale: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

const sortHeaderRight = () => (
  <DataTableColumnHeader className="justify-end">
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

export function EarningsTable({
  rows,
  currencies,
  initialFilters,
}: {
  rows: EarningsTableRow[]
  currencies: string[]
  initialFilters: EarningsInitialFilters
}) {
  const t = useTranslations('dashboard.admin.earnings')
  const locale = useLocale()

  const columns = useMemo<DataTableColumnDef<EarningsTableRow>[]>(
    () => [
      {
        id: 'label',
        accessorKey: 'label',
        header: sortHeader,
        meta: { label: t('table.headers.product') },
        cell: ({ row }) => (
          <div
            className="max-w-[14rem] truncate"
            data-testid="earnings-row"
            data-collector={row.original.collectedBy}
          >
            {row.original.label}
          </div>
        ),
      },
      {
        id: 'transactionDate',
        accessorKey: 'transactionDate',
        header: sortHeader,
        meta: { label: t('table.headers.date'), variant: 'date' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {formatUtcDate(row.original.transactionDate, locale)}
          </span>
        ),
      },
      {
        id: 'month',
        accessorKey: 'month',
        header: sortHeader,
        meta: { label: t('table.monthFilter') },
        enableHiding: true,
      },
      {
        id: 'providerLabel',
        accessorKey: 'providerLabel',
        header: sortHeader,
        meta: { label: t('table.headers.origin') },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.providerLabel}</span>
        ),
      },
      {
        id: 'collectedBy',
        accessorKey: 'collectedBy',
        header: sortHeader,
        meta: { label: t('table.headers.collectedBy') },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {t(`table.collectedBy.${row.original.collectedBy}`)}
          </span>
        ),
      },
      {
        id: 'currencyCode',
        accessorKey: 'currencyCode',
        header: sortHeader,
        meta: { label: t('filters.currency') },
      },
      {
        id: 'kept',
        accessorKey: 'kept',
        header: sortHeaderRight,
        meta: { label: t('table.headers.amount'), variant: 'number' },
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="text-right tabular-nums">
              {formatMoney(r.kept, r.currencyCode, locale)}
              {r.fxRateToUsd != null && r.fxRateToUsd > 0 && (
                // #929: the rate frozen at sale time, so the school can reconcile in its own currency.
                <span className="block text-[10px] text-muted-foreground" data-testid="earnings-fx-rate">
                  {t('table.fxRate', {
                    currency: r.currencyCode,
                    rate: new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(r.fxRateToUsd),
                    source: r.fxRateSource ?? '—',
                  })}
                </span>
              )}
            </div>
          )
        },
      },
      {
        id: 'commission',
        accessorKey: 'commission',
        header: sortHeaderRight,
        meta: { label: t('table.headers.commission'), variant: 'number' },
        cell: ({ row }) => (
          <div className="text-right tabular-nums text-muted-foreground">
            {formatMoney(row.original.commission, row.original.currencyCode, locale)}
          </div>
        ),
      },
      {
        id: 'net',
        accessorKey: 'net',
        header: sortHeaderRight,
        meta: { label: t('table.headers.net'), variant: 'number' },
        cell: ({ row }) => (
          <div className="text-right font-semibold tabular-nums">
            {formatMoney(row.original.net, row.original.currencyCode, locale)}
          </div>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('table.headers.status') },
        cell: ({ row }) => {
          switch (row.original.status) {
            case 'pending':
              return <Badge className="border-warning/30 bg-warning/10 text-[10px] text-warning">{t('status.pending')}</Badge>
            case 'refunded':
              return <Badge variant="secondary" className="text-[10px]">{t('status.refunded')}</Badge>
            case 'partiallyRefunded':
              return <Badge variant="outline" className="text-[10px]">{t('status.partiallyRefunded')}</Badge>
            default:
              return <Badge className="border-success/30 bg-success/10 text-[10px] text-success">{t('status.successful')}</Badge>
          }
        },
      },
    ],
    [t, locale],
  )

  const monthOptions = useMemo(() => {
    const months = Array.from(new Set(rows.map((r) => r.month))).sort().reverse()
    return months.map((m) => ({
      value: m,
      label: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(
        new Date(`${m}-01T00:00:00Z`),
      ),
    }))
  }, [rows, locale])

  const statusOptions = (['successful', 'partiallyRefunded', 'pending', 'refunded'] as const).map((s) => ({
    value: s,
    label: t(`status.${s}`),
  }))
  const collectorOptions = (['school', 'platform'] as const).map((c) => ({
    value: c,
    label: t(`filters.collectors.${c}`),
  }))
  const currencyOptions = currencies.map((c) => ({ value: c, label: c }))

  const initialState = useMemo(
    () => ({
      columnVisibility: { month: false, currencyCode: false },
      sorting: [{ id: 'transactionDate', desc: true }],
      columnFilters: [
        ...(initialFilters.status?.length ? [{ id: 'status', value: initialFilters.status }] : []),
        ...(initialFilters.collectedBy?.length
          ? [{ id: 'collectedBy', value: initialFilters.collectedBy }]
          : []),
        ...(initialFilters.currencyCode?.length
          ? [{ id: 'currencyCode', value: initialFilters.currencyCode }]
          : []),
      ],
    }),
    [initialFilters],
  )

  return (
    <DataTableRoot
      data={rows}
      columns={columns}
      getRowId={(row) => String(row.transactionId)}
      initialState={initialState}
      config={{ initialPageSize: 25 }}
    >
      <DataTableToolbarSection className="mb-4 flex-wrap">
        <DataTableSearchFilter placeholder={t('table.searchPlaceholder')} className="max-w-md" />
        <DataTableFacetedFilter accessorKey="status" title={t('table.headers.status')} options={statusOptions} multiple />
        <DataTableFacetedFilter accessorKey="collectedBy" title={t('filters.collector')} options={collectorOptions} multiple />
        {currencies.length > 1 && (
          <DataTableFacetedFilter accessorKey="currencyCode" title={t('filters.currency')} options={currencyOptions} multiple />
        )}
        <DataTableFacetedFilter accessorKey="month" title={t('table.monthFilter')} options={monthOptions} multiple />
        <DataTableClearFilter />
      </DataTableToolbarSection>
      <DataTable>
        <DataTableHeader />
        <DataTableBody>
          <DataTableEmptyBody>
            <DataTableEmptyIcon>
              <IconReceipt className="h-8 w-8" strokeWidth={1.5} />
            </DataTableEmptyIcon>
            <DataTableEmptyMessage>
              <DataTableEmptyTitle>{t('empty.title')}</DataTableEmptyTitle>
              <DataTableEmptyDescription>{t('empty.description')}</DataTableEmptyDescription>
            </DataTableEmptyMessage>
            <DataTableEmptyFilteredMessage>{t('empty.title')}</DataTableEmptyFilteredMessage>
          </DataTableEmptyBody>
        </DataTableBody>
      </DataTable>
      <DataTablePagination defaultPageSize={25} />
    </DataTableRoot>
  )
}
