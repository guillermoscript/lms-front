'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconCreditCard,
  IconInfoCircle,
  IconMail,
  IconX,
} from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CancelPaymentButton } from '@/components/student/cancel-payment-button'
import { ListToolbar, matchesQuery } from '@/components/student/list-toolbar'
import { StudentProofUpload } from '@/app/[locale]/dashboard/student/payments/student-proof-upload'

export interface PaymentRow {
  requestId: number
  itemName: string
  status: string
  /** ISO timestamp, used for sorting */
  createdAt: string
  amountValue: number
  amountText: string
  dateText: string
  dateTimeText: string
  hasInstructions: boolean
  proofUrl: string | null
}

type Status = 'all' | 'pending' | 'contacted' | 'payment_received' | 'completed' | 'cancelled'
type Sort = 'newest' | 'oldest' | 'amount'

const STATUS_KEY: Record<string, string> = {
  pending: 'pending',
  contacted: 'contacted',
  payment_received: 'paymentReceived',
  completed: 'completed',
  cancelled: 'cancelled',
}

const canCancel = (status: string) => status === 'pending' || status === 'contacted'

function statusBadge(status: string, label: (key: string) => string) {
  const cls = 'w-3 h-3'
  switch (status) {
    case 'pending':
      return { variant: 'secondary' as const, icon: <IconClock className={cls} />, label: label('pending') }
    case 'contacted':
      return { variant: 'default' as const, icon: <IconMail className={cls} />, label: label('contacted') }
    case 'payment_received':
      return { variant: 'default' as const, icon: <IconCreditCard className={cls} />, label: label('paymentReceived') }
    case 'completed':
      return { variant: 'default' as const, icon: <IconCheck className={cls} />, label: label('completed') }
    case 'cancelled':
      return { variant: 'destructive' as const, icon: <IconX className={cls} />, label: label('cancelled') }
    default:
      return { variant: 'secondary' as const, icon: <IconAlertCircle className={cls} />, label: status }
  }
}

/** Search / filter / sort for the student's payment requests (table on desktop, cards on mobile). */
export function PaymentsExplorer({ rows }: { rows: PaymentRow[] }) {
  const t = useTranslations('dashboard.student.payments')
  const locale = useLocale()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [sort, setSort] = useState<Sort>('newest')

  const badgeFor = (s: string) => statusBadge(s, (k) => t(`status.${k}`))

  const statusOptions = [
    { value: 'all', label: t('list.all') },
    ...(Object.keys(STATUS_KEY) as Exclude<Status, 'all'>[]).map((value) => ({
      value,
      label: t(`status.${STATUS_KEY[value]}`),
    })),
  ]
  const sortOptions = (['newest', 'oldest', 'amount'] as const).map((value) => ({
    value,
    label: t(`list.${value}`),
  }))

  const visible = rows
    .filter(
      (r) =>
        matchesQuery(search, locale, r.itemName) && (status === 'all' || r.status === status)
    )
    .sort((a, b) => {
      if (sort === 'amount') return b.amountValue - a.amountValue || b.requestId - a.requestId
      const diff = a.createdAt.localeCompare(b.createdAt)
      return (sort === 'oldest' ? diff : -diff) || b.requestId - a.requestId
    })
  const filtered = search !== '' || status !== 'all'

  function reset() {
    setSearch('')
    setStatus('all')
  }

  const actions = (r: PaymentRow): ReactNode => (
    <>
      {r.proofUrl ? (
        <a href={r.proofUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="ghost">
            {t('viewProof')}
          </Button>
        </a>
      ) : canCancel(r.status) ? (
        <StudentProofUpload requestId={r.requestId} />
      ) : null}
      {canCancel(r.status) && <CancelPaymentButton requestId={r.requestId} />}
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel={t('list.search')}
        searchPlaceholder={t('list.searchPlaceholder')}
        selects={[
          {
            id: 'status',
            label: t('list.status'),
            value: status,
            options: statusOptions,
            onChange: (v) => setStatus(v as Status),
          },
          {
            id: 'sort',
            label: t('list.sort'),
            value: sort,
            options: sortOptions,
            onChange: (v) => setSort(v as Sort),
          },
        ]}
        resultsText={t('list.results', { count: visible.length, total: rows.length })}
        showReset={filtered}
        onReset={reset}
        resetLabel={t('list.reset')}
      />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">{t('list.noMatches')}</p>
          <p className="text-sm text-muted-foreground">{t('list.noMatchesHint')}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            {t('list.reset')}
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop View: Table */}
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle>{t('tableTitle')}</CardTitle>
              <CardDescription>{t('tableDescription', { count: rows.length })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('table.product')}</TableHead>
                    <TableHead>{t('table.amount')}</TableHead>
                    <TableHead>{t('table.status')}</TableHead>
                    <TableHead>{t('table.date')}</TableHead>
                    <TableHead>{t('table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => {
                    const badge = badgeFor(r.status)
                    return (
                      <TableRow key={r.requestId}>
                        <TableCell className="font-medium max-w-[200px] truncate">{r.itemName}</TableCell>
                        <TableCell>{r.amountText}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className="gap-1">
                            {badge.icon}
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.dateText}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {r.hasInstructions && (
                              <Link href={`/dashboard/student/payments/${r.requestId}`}>
                                <Button size="sm" variant="outline">
                                  {t('viewDetails')}
                                </Button>
                              </Link>
                            )}
                            {actions(r)}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile View: Cards */}
          <div className="md:hidden space-y-4">
            {visible.map((r) => {
              const badge = badgeFor(r.status)
              return (
                <Card key={r.requestId}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{r.itemName}</CardTitle>
                        <CardDescription className="mt-1">{r.dateTimeText}</CardDescription>
                      </div>
                      <Badge variant={badge.variant} className="gap-1">
                        {badge.icon}
                        {badge.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('amount')}:</span>
                      <span className="font-semibold">{r.amountText}</span>
                    </div>

                    {r.hasInstructions && (
                      <Alert>
                        <IconInfoCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">{t('instructionsAvailable')}</AlertDescription>
                      </Alert>
                    )}

                    <div className="flex gap-2 pt-2">
                      {r.hasInstructions && (
                        <Link href={`/dashboard/student/payments/${r.requestId}`} className="flex-1">
                          <Button size="sm" variant="outline" className="w-full">
                            {t('viewDetails')}
                          </Button>
                        </Link>
                      )}
                      {actions(r)}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
