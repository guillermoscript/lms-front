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
import { IconCurrencyDollar } from '@tabler/icons-react'

interface Transaction {
  amount: string
  status: string
  payment_provider: string
  created_at: string
}

interface TransactionListProps {
  transactions: Transaction[]
}

export function TransactionList({ transactions }: TransactionListProps) {
  const t = useTranslations('dashboard.teacher.revenue.transactions')

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('empty')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <IconCurrencyDollar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {t('emptyDescription')}
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
              <TableHead>{t('date')}</TableHead>
              <TableHead>{t('amount')}</TableHead>
              <TableHead>{t('provider')}</TableHead>
              <TableHead>{t('status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction, index) => (
              <TableRow key={index}>
                <TableCell>
                  {new Date(transaction.created_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  ${parseFloat(transaction.amount).toFixed(2)}
                </TableCell>
                <TableCell className="capitalize">
                  {transaction.payment_provider || 'stripe'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      transaction.status === 'successful'
                        ? 'default'
                        : transaction.status === 'pending'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {transaction.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
