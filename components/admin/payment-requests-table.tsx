'use client'

import { useCallback, useMemo, useState } from 'react'
import { formatDateTime } from '@/lib/format-date-time'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconReceipt } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PAYMENT_REQUEST_STATUS_STYLES } from '@/lib/payments/payment-request-status'
import { PaymentRequestDialog } from './payment-request-dialog'
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
  DataTableEmptyFilteredMessage,
} from '@/components/niko-table/components/data-table-empty-state'
import type { DataTableColumnDef } from '@/components/niko-table/types'

interface PaymentRequest {
  request_id: number
  contact_name: string
  contact_email: string
  contact_phone: string | null
  message: string | null
  status: string
  payment_method: string | null
  payment_instructions: string | null
  payment_amount: number | null
  payment_currency: string | null
  invoice_number: string | null
  admin_notes: string | null
  created_at: string
  payment_reference?: string | null
  payment_reported_at?: string | null
  expired_at?: string | null
  user: {
    id: string
    full_name: string
  } | null
  product: {
    product_id: number
    name: string
    price: number
    currency: string
  } | null
  plan: {
    plan_id: number
    plan_name: string
    price: number
    currency: string
  } | null
}

type PaymentRequestWithUser = PaymentRequest

const STATUSES = ['pending', 'contacted', 'payment_received', 'completed', 'cancelled'] as const

interface RequestRow {
  id: number
  student: string
  email: string
  product: string
  amount: number
  method: string
  status: string
  invoice: string
  createdAt: string
  /** Hidden column the global search matches against. */
  searchText: string
  request: PaymentRequest
}

const sortHeader = () => (
  <DataTableColumnHeader>
    <DataTableColumnTitle />
    <DataTableColumnSortMenu />
  </DataTableColumnHeader>
)

export function PaymentRequestsTable({
  requests,
  timeZone,
}: {
  requests: PaymentRequestWithUser[]
  /** Tenant IANA zone — the same one the student's My Payments page uses (#727). */
  timeZone?: string | null
}) {
  const { locale } = useParams()
  const t = useTranslations('dashboard.admin.paymentRequests')
  // Tenant-configured methods outside the catalogue fall back to the raw key.
  const methodLabel = useCallback(
    (m: string) => (t.has(`table.methods.${m}`) ? t(`table.methods.${m}`) : m),
    [t],
  )
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null)

  const rows = useMemo<RequestRow[]>(
    () =>
      requests.map((request) => {
        const student = request.user?.full_name || request.contact_name
        const product = request.product?.name || request.plan?.plan_name || ''
        return {
          id: request.request_id,
          student,
          email: request.contact_email,
          product,
          amount: Number(request.payment_amount) || 0,
          method: request.payment_method ?? '',
          status: request.status,
          invoice: request.invoice_number ?? '',
          createdAt: request.created_at,
          searchText: [
            request.request_id,
            student,
            request.contact_email,
            product,
            request.invoice_number,
            request.payment_reference,
          ]
            .filter(Boolean)
            .join(' '),
          request,
        }
      }),
    [requests],
  )

  const columns = useMemo<DataTableColumnDef<RequestRow>[]>(() => {
    const dateOptions = { locale: (locale as string) || 'en', timeZone }
    return [
      {
        id: 'searchText',
        accessorKey: 'searchText',
        header: () => null,
        cell: () => null,
        enableSorting: false,
        enableHiding: false,
        meta: { label: 'search' },
      },
      {
        id: 'id',
        accessorKey: 'id',
        header: sortHeader,
        meta: { label: t('table.headers.id') },
        cell: ({ row }) => (
          <span className="font-mono text-sm">#{row.original.id}</span>
        ),
      },
      {
        id: 'student',
        accessorKey: 'student',
        header: sortHeader,
        meta: { label: t('table.headers.student') },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.student}</div>
            <div className="text-sm text-muted-foreground">{row.original.email}</div>
          </div>
        ),
      },
      {
        id: 'product',
        accessorKey: 'product',
        header: sortHeader,
        meta: { label: t('table.headers.product') },
        cell: ({ row }) => (
          <div className="max-w-xs truncate">{row.original.product || '—'}</div>
        ),
      },
      {
        id: 'method',
        accessorKey: 'method',
        header: sortHeader,
        meta: { label: t('table.headers.method') },
        cell: ({ row }) => (
          <span className="text-sm">{row.original.method ? methodLabel(row.original.method) : '—'}</span>
        ),
      },
      {
        id: 'amount',
        accessorKey: 'amount',
        header: sortHeader,
        meta: { label: t('table.headers.amount'), variant: 'number' },
        cell: ({ row }) => {
          const { request } = row.original
          return (
            <div className="font-medium tabular-nums">
              {request.payment_currency
                ? new Intl.NumberFormat(locale as string, {
                    style: 'currency',
                    currency: request.payment_currency.toUpperCase(),
                  }).format(request.payment_amount ?? 0)
                : '—'}
            </div>
          )
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: sortHeader,
        meta: { label: t('table.headers.status') },
        cell: ({ row }) => {
          const { request } = row.original
          return (
            <div className="space-y-1">
              <Badge
                variant="outline"
                className={PAYMENT_REQUEST_STATUS_STYLES[request.status]}
              >
                {t(`status.${request.status}`)}
              </Badge>
              {/* The queue's whole job is "who is waiting on me". A
                  reported reference is the row to work next; a lapsed one
                  is the row to stop looking at (#802). */}
              {request.payment_reported_at && (
                <div className="text-xs font-medium text-brand-text">
                  {t('table.reported')}
                  {request.payment_reference && (
                    <span className="ml-1 font-mono text-muted-foreground">
                      {request.payment_reference}
                    </span>
                  )}
                </div>
              )}
              {request.expired_at && (
                <div className="text-xs text-muted-foreground">{t('table.expired')}</div>
              )}
            </div>
          )
        },
      },
      {
        id: 'invoice',
        accessorKey: 'invoice',
        header: sortHeader,
        meta: { label: t('table.headers.invoice') },
        cell: ({ row }) =>
          row.original.invoice ? (
            <span className="font-mono text-xs">{row.original.invoice}</span>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: sortHeader,
        meta: { label: t('table.headers.date'), variant: 'date' },
        cell: ({ row }) => (
          <>
            <div className="text-sm" suppressHydrationWarning>
              {formatDateTime(row.original.createdAt, { ...dateOptions, precision: 'date' })}
            </div>
            <div className="text-xs text-muted-foreground" suppressHydrationWarning>
              {formatDateTime(row.original.createdAt, { ...dateOptions, precision: 'time' })}
            </div>
          </>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('table.headers.actions')}</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedRequest(row.original.request)}
          >
            {t('table.manage')}
          </Button>
        ),
      },
    ]
  }, [t, locale, timeZone, methodLabel])

  const statusOptions = STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))
  const methodOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.method).filter(Boolean)))
        .sort()
        .map((m) => ({ value: m, label: methodLabel(m) })),
    [rows, methodLabel],
  )

  return (
    <>
      <DataTableRoot
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        config={{ initialPageSize: 25 }}
        initialState={{ columnVisibility: { searchText: false } }}
      >
        <DataTableToolbarSection className="mb-4 flex-wrap">
          <DataTableSearchFilter placeholder={t('table.searchPlaceholder')} className="max-w-md" />
          <DataTableFacetedFilter accessorKey="status" title={t('table.headers.status')} options={statusOptions} multiple />
          {methodOptions.length > 0 && (
            <DataTableFacetedFilter accessorKey="method" title={t('table.headers.method')} options={methodOptions} multiple />
          )}
          <DataTableClearFilter />
        </DataTableToolbarSection>
        <DataTable>
          <DataTableHeader />
          <DataTableBody>
            <DataTableEmptyBody>
              <DataTableEmptyIcon>
                <IconReceipt className="h-8 w-8" />
              </DataTableEmptyIcon>
              <DataTableEmptyMessage>
                <DataTableEmptyTitle>{t('table.noRequests')}</DataTableEmptyTitle>
              </DataTableEmptyMessage>
              <DataTableEmptyFilteredMessage>{t('table.noRequests')}</DataTableEmptyFilteredMessage>
            </DataTableEmptyBody>
          </DataTableBody>
        </DataTable>
        <DataTablePagination defaultPageSize={25} />
      </DataTableRoot>

      {selectedRequest && (
        <PaymentRequestDialog
          request={selectedRequest}
          open={!!selectedRequest}
          onOpenChange={(open) => !open && setSelectedRequest(null)}
          timeZone={timeZone}
        />
      )}
    </>
  )
}
