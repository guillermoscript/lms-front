import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { IconArrowLeft, IconUser, IconMail, IconPhone, IconShoppingCart, IconCalendar, IconFileInvoice } from '@tabler/icons-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { PaymentRequestActions } from '@/components/admin/payment-request-actions'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

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
  const supabase = await createClient()
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

  const currencySymbol = request.payment_currency === 'usd' ? '$' : '€'

  // Get status badge variant
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary'
      case 'contacted':
        return 'default'
      case 'payment_received':
        return 'outline'
      case 'completed':
        return 'default'
      case 'cancelled':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  // Get status color for the badge
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500'
      case 'contacted':
        return 'bg-blue-500'
      case 'payment_received':
        return 'bg-purple-500'
      case 'completed':
        return 'bg-green-500'
      case 'cancelled':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
                  variant={getStatusVariant(request.status)}
                  className={`${getStatusColor(request.status)} text-white`}
                >
                  {t(`status.${request.status}`)}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                {t('detail.created', { date: format(new Date(request.created_at), 'PPp') })}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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
                  <a href={`mailto:${request.contact_email}`} className="text-blue-600 hover:underline">
                    {request.contact_email}
                  </a>
                </div>
                {request.contact_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <IconPhone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${request.contact_phone}`} className="text-blue-600 hover:underline">
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
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
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
                  {currencySymbol}{request.payment_amount.toFixed(2)}
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
                      {request.product.product_courses.map((pc: any) => (
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
              {request.payment_method && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentMethod')}</p>
                  <p className="text-sm text-muted-foreground">{request.payment_method}</p>
                </div>
              )}

              {request.payment_instructions && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentInstructions')}</p>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg whitespace-pre-wrap">
                    {request.payment_instructions}
                  </p>
                </div>
              )}

              {request.payment_deadline && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentDeadline')}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(request.payment_deadline), 'PPp')}
                  </p>
                </div>
              )}

              {request.payment_confirmed_at && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentConfirmed')}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(request.payment_confirmed_at), 'PPp')}
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
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
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
              <PaymentRequestActions request={request} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
