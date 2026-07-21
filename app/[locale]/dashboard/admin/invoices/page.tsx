import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'
import {
  IconFileInvoice,
  IconAlertCircle,
  IconInfoCircle,
  IconExternalLink,
} from '@tabler/icons-react'

export default async function AdminInvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.invoices')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  // Verify admin role for this tenant
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!membership || membership.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <IconAlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold">{t('accessDenied')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('accessDeniedDesc')}</p>
        </div>
      </div>
    )
  }

  // Query payment_requests that have an invoice_number (the only real invoice documents)
  const { data: requests } = await supabase
    .from('payment_requests')
    .select('request_id, invoice_number, status, payment_amount, payment_currency, created_at, payment_confirmed_at, user_id, product_id')
    .eq('tenant_id', tenantId)
    .not('invoice_number', 'is', null)
    .order('created_at', { ascending: false })

  const rows = requests || []

  // Resolve product names in one batch
  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))]
  const { data: products } = productIds.length > 0
    ? await supabase.from('products').select('product_id, name').in('product_id', productIds)
    : { data: [] }

  const productsMap = new Map((products || []).map((p) => [p.product_id, p.name]))

  const fmt = (amount: number | null, currency: string | null) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
    }).format(amount || 0)

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved':
      case 'completed':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px]">
            {t('status.paid')}
          </Badge>
        )
      case 'pending':
        return (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px]">
            {t('status.pending')}
          </Badge>
        )
      case 'rejected':
      case 'cancelled':
        return (
          <Badge variant="destructive" className="text-[10px]">
            {t('status.cancelled')}
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-[10px]">
            {status}
          </Badge>
        )
    }
  }

  return (
    <div className="min-h-screen bg-background" data-testid="invoices-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: t('title') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        {/* Contextual note */}
        <div className="mb-6 flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <IconInfoCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <p>
            {t('note.text')}{' '}
            <Link
              href="/dashboard/admin/transactions"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t('note.transactionsLink')}
            </Link>
            .
          </p>
        </div>

        <Card>
          <CardHeader className="border-b bg-muted/15">
            <div className="flex items-center justify-between gap-4">
              <CardTitle>{t('table.title')}</CardTitle>
              {rows.length > 0 && (
                <span className="text-sm tabular-nums text-muted-foreground">{rows.length}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[640px] text-sm">
                <TableHeader className="border-b bg-muted/20">
                  <TableRow>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.invoiceNumber')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.item')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.amount')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.status')}
                    </TableHead>
                    <TableHead className="hidden px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:table-cell">
                      {t('table.headers.date')}
                    </TableHead>
                    <TableHead className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('table.headers.actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {rows.length > 0 ? (
                    rows.map((req) => (
                      <TableRow
                        key={req.request_id}
                        className="border-b last:border-0 transition-colors hover:bg-muted/40"
                      >
                        <TableCell className="px-4 py-3 align-top">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums">
                            {req.invoice_number}
                          </code>
                        </TableCell>
                        <TableCell className="px-4 py-3 align-top">
                          <p className="font-medium">
                            {req.product_id
                              ? (productsMap.get(req.product_id) ?? t('table.unknownProduct'))
                              : t('table.unknownProduct')}
                          </p>
                          {req.created_at && (
                            <p className="mt-1 text-xs text-muted-foreground md:hidden">
                              {format(new Date(req.created_at), 'MMM d, yyyy', { locale: dateLocale })}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right align-top font-semibold tabular-nums">
                          {fmt(req.payment_amount, req.payment_currency)}
                        </TableCell>
                        <TableCell className="px-4 py-3 align-top">
                          {statusBadge(req.status || '')}
                          {req.payment_confirmed_at && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {format(new Date(req.payment_confirmed_at), 'MMM d, yyyy', { locale: dateLocale })}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden px-4 py-3 align-top text-xs tabular-nums text-muted-foreground md:table-cell">
                          {req.created_at
                            ? format(new Date(req.created_at), 'MMM d, yyyy', { locale: dateLocale })
                            : '—'}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right align-top">
                          <Link
                            href={`/api/invoices/${req.invoice_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="hidden sm:inline">{t('table.viewInvoice')}</span>
                            <span className="sr-only sm:hidden">{t('table.viewInvoice')}</span>
                            <IconExternalLink className="h-3 w-3" strokeWidth={2} />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <IconFileInvoice className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('empty.title')}</p>
                            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                              {t('empty.description')}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
