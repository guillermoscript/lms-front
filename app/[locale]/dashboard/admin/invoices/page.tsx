import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InvoicesTable, type InvoiceRow } from '@/components/admin/invoices-table'
import Link from 'next/link'
import {
  IconAlertCircle,
  IconInfoCircle,
} from '@tabler/icons-react'

export default async function AdminInvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.invoices')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')

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
  // Paged and count-verified: a plain select silently truncates at 1000 rows.
  const rows = await fetchAllRows('payment_requests', (from, to) =>
    supabase
      .from('payment_requests')
      .select('request_id, invoice_number, status, payment_amount, payment_currency, created_at, payment_confirmed_at, user_id, product_id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .not('invoice_number', 'is', null)
      .order('created_at', { ascending: false })
      .order('request_id')
      .range(from, to),
  )

  // Resolve product names: every tenant product, paged (an `.in()` over many
  // ids would overflow the URL and the 1000-row cap).
  const products = await fetchAllRows('products', (from, to) =>
    supabase
      .from('products')
      .select('product_id, name', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('product_id')
      .range(from, to),
  )

  const productsMap = new Map(products.map((p) => [p.product_id, p.name]))

  const tableRows: InvoiceRow[] = rows.map((r) => ({
    id: r.request_id,
    invoiceNumber: r.invoice_number as string,
    item: r.product_id ? (productsMap.get(r.product_id) ?? null) : null,
    amount: Number(r.payment_amount ?? 0),
    currency: r.payment_currency,
    rawStatus: r.status || '',
    createdAt: r.created_at,
    confirmedAt: r.payment_confirmed_at,
  }))

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
            <InvoicesTable rows={tableRows} locale={locale} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
