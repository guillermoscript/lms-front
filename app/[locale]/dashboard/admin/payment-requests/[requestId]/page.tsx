import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { IconArrowLeft, IconUser, IconMail, IconPhone, IconShoppingCart, IconCalendar, IconFileInvoice } from '@tabler/icons-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/currency'
import { formatDateTime } from '@/lib/format-date-time'
import { getTenantTimeZone } from '@/lib/tenant-timezone'
import { getManualPaymentInstructions } from '@/app/actions/admin/settings'
import { PaymentRequestActions } from '@/components/admin/payment-request-actions'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { PAYMENT_REQUEST_STATUS_STYLES } from '@/lib/payments/payment-request-status'

interface PageProps {
  params: Promise<{
    locale: string
    requestId: string
  }>
}

export default async function PaymentRequestDetailPage({ params }: PageProps) {
  const { requestId } = await params
  const t = await getTranslations('dashboard.admin.paymentRequests')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = createAdminClient()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()
  const superAdmin = await isSuperAdmin()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Verify admin access
  if (role !== 'admin' && !superAdmin) {
    redirect('/dashboard')
  }

  // Fetch payment request with full details
  const { data: request, error } = await supabase
    .from('payment_requests')
    .select(`
      *,
      user:profiles!payment_requests_user_id_fkey(
        id,
        full_name,
        avatar_url
      ),
      product:products(
        product_id,
        name,
        description,
        price,
        currency,
        product_courses(
          course:courses(
            course_id,
            title
          )
        )
      ),
      plan:plans(
        plan_id,
        plan_name,
        description,
        price,
        currency
      ),
      processor:profiles!payment_requests_processed_by_fkey(
        id,
        full_name
      )
    `)
    .eq('request_id', requestId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !request) {
    redirect('/dashboard/admin/payment-requests')
  }

  // Same locale + tenant zone as the student's My Payments page, and the
  // request's own currency (never a `$`/`€` guess) — #727.
  const [locale, timeZone, schoolInstructions] = await Promise.all([
    getLocale(),
    getTenantTimeZone(tenantId),
    getManualPaymentInstructions(),
  ])
  const fmtDate = (value: string) => formatDateTime(value, { locale, timeZone })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('paymentRequests'), href: '/dashboard/admin/payment-requests' },
                { label: tBreadcrumbs('paymentRequestDetails') },
              ]}
            />
          </div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold md:text-3xl">
                  {t('detail.title', { id: request.request_id })}
                </h1>
                <Badge
                  variant="outline"
                  className={PAYMENT_REQUEST_STATUS_STYLES[request.status]}
                >
                  {t(`status.${request.status}`)}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                {t('detail.created', { date: fmtDate(request.created_at) })}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto container px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Student Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconUser className="h-5 w-5" />
                {t('detail.studentInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <IconUser className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{request.contact_name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <IconMail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${request.contact_email}`} className="text-brand-text hover:underline">
                    {request.contact_email}
                  </a>
                </div>
                {request.contact_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <IconPhone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${request.contact_phone}`} className="text-brand-text hover:underline">
                      {request.contact_phone}
                    </a>
                  </div>
                )}
              </div>

              {request.message && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2">{t('detail.studentMessage')}</p>
                    <p className="text-sm text-foreground bg-muted p-3 rounded-lg">
                      {request.message}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Product / Plan Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconShoppingCart className="h-5 w-5" />
                {t('detail.productInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1">
                  {request.product?.name || request.plan?.plan_name || '—'}
                </h3>
                {(request.product?.description || request.plan?.description) && (
                  <p className="text-sm text-muted-foreground">
                    {request.product?.description || request.plan?.description}
                  </p>
                )}
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">
                  {formatCurrency(Number(request.payment_amount), request.payment_currency || 'usd', locale)}
                </span>
                <span className="text-sm text-muted-foreground uppercase">
                  {request.payment_currency}
                </span>
              </div>

              {request.product?.product_courses && request.product.product_courses.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2">
                      {t('detail.includedCourses')}
                    </p>
                    <ul className="space-y-1">
                      {request.product.product_courses.map((pc: { course: { course_id: number; title: string } }) => (
                        <li key={pc.course.course_id} className="text-sm text-muted-foreground">
                          • {pc.course.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Payment Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconCalendar className="h-5 w-5" />
                {t('detail.paymentDetails')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* What the student says they sent (#802). Kept visually distinct
                  from the school-owned fields below it: everything here is a
                  claim to check against a statement, not a fact. */}
              {request.payment_reported_at && (
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{t('detail.reported.title')}</p>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(request.payment_reported_at)}
                    </span>
                  </div>

                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('detail.reported.reference')}</dt>
                      <dd className="font-mono text-sm font-semibold">{request.payment_reference}</dd>
                    </div>
                    {request.paid_at && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('detail.reported.paidAt')}</dt>
                        <dd className="font-medium">{fmtDate(request.paid_at)}</dd>
                      </div>
                    )}
                    {request.reported_amount != null && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('detail.reported.amount')}</dt>
                        <dd className="font-medium">
                          {formatCurrency(
                            Number(request.reported_amount),
                            request.reported_currency || request.payment_currency || 'usd',
                            locale,
                          )}
                        </dd>
                      </div>
                    )}
                    {request.paid_to_account && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('detail.reported.paidTo')}</dt>
                        <dd className="font-medium">{request.paid_to_account}</dd>
                      </div>
                    )}
                    {request.payer_name && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('detail.reported.payerName')}</dt>
                        <dd className="font-medium">{request.payer_name}</dd>
                      </div>
                    )}
                    {request.payer_document && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('detail.reported.payerDocument')}</dt>
                        <dd className="font-medium">{request.payer_document}</dd>
                      </div>
                    )}
                    {request.payer_bank && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('detail.reported.payerBank')}</dt>
                        <dd className="font-medium">{request.payer_bank}</dd>
                      </div>
                    )}
                    {request.payer_phone && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('detail.reported.payerPhone')}</dt>
                        <dd className="font-medium">{request.payer_phone}</dd>
                      </div>
                    )}
                  </dl>

                  {/* Only flagged when the two are directly comparable. A school
                      priced in USD and paid in bolívares is the normal case, not
                      a discrepancy, so a different currency says "check it",
                      never "it is wrong". */}
                  {request.reported_amount != null && (
                    (request.reported_currency || request.payment_currency) !== request.payment_currency ? (
                      <p className="text-xs text-warning-foreground">
                        {t('detail.reported.currencyDiffers')}
                      </p>
                    ) : Number(request.reported_amount) !== Number(request.payment_amount) ? (
                      <p className="text-xs text-warning-foreground">
                        {t('detail.reported.amountDiffers', {
                          expected: formatCurrency(
                            Number(request.payment_amount),
                            request.payment_currency || 'usd',
                            locale,
                          ),
                        })}
                      </p>
                    ) : null
                  )}
                </div>
              )}

              {/* Lapsed unpaid rather than cancelled by a human — worth saying
                  outright, since the status reads `cancelled` either way. */}
              {request.expired_at && (
                <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {t('detail.expiredOn', { date: fmtDate(request.expired_at) })}
                </p>
              )}

              {request.payment_method && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentMethod')}</p>
                  <p className="text-sm text-muted-foreground">{request.payment_method}</p>
                </div>
              )}

              {request.payment_instructions && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentInstructions')}</p>
                  <p className="text-sm text-foreground bg-muted p-3 rounded-lg whitespace-pre-wrap">
                    {request.payment_instructions}
                  </p>
                </div>
              )}

              {request.payment_deadline && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentDeadline')}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmtDate(request.payment_deadline)}
                  </p>
                </div>
              )}

              {request.payment_confirmed_at && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentConfirmed')}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmtDate(request.payment_confirmed_at)}
                  </p>
                </div>
              )}

              {request.invoice_number && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.invoiceNumber')}</p>
                  <p className="text-sm font-mono bg-muted px-2 py-1 rounded inline-block">
                    {request.invoice_number}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin Notes & Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconFileInvoice className="h-5 w-5" />
                {t('detail.adminSection')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.admin_notes && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.adminNotes')}</p>
                  <p className="text-sm text-foreground bg-muted p-3 rounded-lg">
                    {request.admin_notes}
                  </p>
                </div>
              )}

              {request.processor && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.processedBy')}</p>
                  <p className="text-sm text-muted-foreground">{request.processor.full_name}</p>
                </div>
              )}

              <Separator />

              {/* Action Buttons */}
              <PaymentRequestActions request={request} defaultInstructions={schoolInstructions} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
