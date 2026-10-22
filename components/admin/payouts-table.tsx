'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { IconBuildingBank } from '@tabler/icons-react'
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

export interface PayoutRow {
  id: string
  periodStart: string | null
  periodEnd: string | null
  amount: number
  currency: string | null
  status: string
  failureReason: string | null
  method: 'manual' | 'stripeConnect'
  note: string | null
  paidAt: string | null
  stripePayoutId: string | null
}

const STATUSES = ['paid', 'processing', 'pending', 'failed'] as const

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

export function PayoutsTable({ rows, locale }: { rows: PayoutRow[]; locale: string }) {
  const t = useTranslations('dashboard.admin.payouts')
  const dateLocale = locale === 'es' ? es : enUS

  const columns = useMemo<DataTableColumnDef<PayoutRow>[]>(() => {
    const fmtDate = (iso: string, pattern = locale === 'es' ? 'd MMM yyyy' : 'MMM d, yyyy') =>
      format(new Date(iso), pattern, { locale: dateLocale })

    return [
      {
        id: 'periodStart',
        accessorKey: 'periodStart',
        header: sortHeader,
        meta: { label: t('table.headers.period'), variant: 'date' },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.original.periodStart ? fmtDate(row.original.periodStart) : '—'}
            {' – '}
            {row.original.periodEnd ? fmtDate(row.original.periodEnd) : '—'}
          </span>
        ),
      },
      {
        id: 'amount',
        accessorKey: 'amount',
        header: sortHeader,
        meta: { label: t('table.headers.amount'), variant: 'number' },
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {formatMoney(row.original.amount, row.original.currency, locale)}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('table.headers.status') },
        cell: ({ row }) => {
          const { status, failureReason } = row.original
          return (
            <div>
              {status === 'paid' ? (
                <Badge className="bg-success/10 text-success border-success/30 text-[10px]">
                  {t('status.paid')}
                </Badge>
              ) : status === 'processing' ? (
                <Badge className="bg-brand-tint text-brand-text border-primary/30 text-[10px]">
                  {t('status.processing')}
                </Badge>
              ) : status === 'pending' ? (
                <Badge className="bg-warning/10 text-warning border-warning/30 text-[10px]">
                  {t('status.pending')}
                </Badge>
              ) : status === 'failed' ? (
                <Badge variant="destructive" className="text-[10px]">
                  {t('status.failed')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {status}
                </Badge>
              )}
              {failureReason && (
                <p className="mt-0.5 text-[10px] text-destructive">{failureReason}</p>
              )}
            </div>
          )
        },
      },
      {
        id: 'method',
        accessorKey: 'method',
        header: sortHeader,
        meta: { label: t('table.headers.method') },
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground">
            {row.original.method === 'manual' ? t('method.manual') : t('method.stripeConnect')}
            {row.original.note && (
              <p className="mt-0.5 max-w-[16rem] text-[10px] text-muted-foreground">
                {row.original.note}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'paidAt',
        accessorKey: 'paidAt',
        header: sortHeader,
        meta: { label: t('table.headers.paidAt'), variant: 'date' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.paidAt ? fmtDate(row.original.paidAt, locale === 'es' ? 'd MMM yyyy HH:mm' : 'MMM d, yyyy HH:mm') : '—'}
          </span>
        ),
      },
      {
        id: 'stripePayoutId',
        accessorKey: 'stripePayoutId',
        header: sortHeader,
        meta: { label: t('table.headers.stripeRef') },
        cell: ({ row }) => {
          const ref = row.original.stripePayoutId
          return ref ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              {ref.length > 24 ? `${ref.slice(0, 12)}…${ref.slice(-8)}` : ref}
            </code>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        },
      },
    ]
  }, [t, locale, dateLocale])

  const statusOptions = STATUSES.filter((s) => rows.some((r) => r.status === s)).map((s) => ({
    value: s,
    label: t(`status.${s}`),
  }))
  const methodOptions = (['stripeConnect', 'manual'] as const).map((m) => ({
    value: m,
    label: t(`method.${m}`),
  }))

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
              <IconBuildingBank className="h-8 w-8" />
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
