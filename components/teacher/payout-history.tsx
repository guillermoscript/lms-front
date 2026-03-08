'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { IconTrendingUp } from '@tabler/icons-react'

interface Payout {
  payout_id: number
  amount: string
  currency: string
  status: string
  stripe_payout_id: string | null
  period_start: string
  period_end: string
  created_at: string
  paid_at: string | null
}

interface PayoutHistoryProps {
  payouts: Payout[]
}

export function PayoutHistory({ payouts }: PayoutHistoryProps) {
  const t = useTranslations('dashboard.teacher.revenue.payouts')

  if (payouts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('empty')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <IconTrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {t('emptyDescription')}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {t('emptyHint')}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('period')}</TableHead>
              <TableHead>{t('amount')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('paidDate')}</TableHead>
              <TableHead>{t('stripeId')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((payout) => (
              <TableRow key={payout.payout_id}>
                <TableCell>
                  <div className="text-sm">
                    <div>
                      {new Date(payout.period_start).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="text-muted-foreground">
                      {t('to')}{' '}
                      {new Date(payout.period_end).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  ${parseFloat(payout.amount).toFixed(2)}{' '}
                  <span className="text-xs text-muted-foreground uppercase">
                    {payout.currency}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      payout.status === 'paid'
                        ? 'default'
                        : payout.status === 'pending'
                        ? 'secondary'
                        : payout.status === 'processing'
                        ? 'outline'
                        : 'destructive'
                    }
                  >
                    {payout.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {payout.paid_at ? (
                    new Date(payout.paid_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {payout.stripe_payout_id ? (
                    <a
                      href={`https://dashboard.stripe.com/payouts/${payout.stripe_payout_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                      aria-label={t('viewOnStripe')}
                    >
                      {payout.stripe_payout_id.substring(0, 20)}...
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
