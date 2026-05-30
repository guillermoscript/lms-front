import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import {
  IconArrowLeft,
  IconClock,
  IconCheck,
  IconX,
  IconMail,
  IconCreditCard,
  IconAlertCircle,
  IconInfoCircle,
  IconCalendar,
} from '@tabler/icons-react'
import { CancelPaymentButton } from '@/components/student/cancel-payment-button'
import { StudentProofUpload } from '../student-proof-upload'

interface PageProps {
  params: Promise<{ locale: string; requestId: string }>
}

export default async function StudentPaymentDetailPage({ params }: PageProps) {
  const { requestId } = await params
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.student.payments')

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Scope to the signed-in student AND tenant so a request can only ever be
  // viewed by its owner — request_id alone is not authorization.
  const { data: request } = await supabase
    .from('payment_requests')
    .select(`
      request_id,
      created_at,
      status,
      payment_amount,
      payment_currency,
      payment_method,
      payment_instructions,
      payment_deadline,
      proof_url,
      product:products ( product_id, name ),
      plan:plans ( plan_id, plan_name )
    `)
    .eq('request_id', requestId)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!request) return notFound()

  const product = request.product as any
  const plan = request.plan as any
  const itemName = product?.name || plan?.plan_name || t('unknownProduct')

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { variant: 'secondary' as const, icon: <IconClock className="w-3 h-3" />, label: t('status.pending') }
      case 'contacted':
        return { variant: 'default' as const, icon: <IconMail className="w-3 h-3" />, label: t('status.contacted') }
      case 'payment_received':
        return { variant: 'default' as const, icon: <IconCreditCard className="w-3 h-3" />, label: t('status.paymentReceived') }
      case 'completed':
        return { variant: 'default' as const, icon: <IconCheck className="w-3 h-3" />, label: t('status.completed') }
      case 'cancelled':
        return { variant: 'destructive' as const, icon: <IconX className="w-3 h-3" />, label: t('status.cancelled') }
      default:
        return { variant: 'secondary' as const, icon: <IconAlertCircle className="w-3 h-3" />, label: status }
    }
  }

  const formatDateTime = (dateString: string) =>
    new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString))

  const statusBadge = getStatusBadge(request.status)
  const canCancel = request.status === 'pending' || request.status === 'contacted'

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <Link href="/dashboard/student/payments">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('detail.backToPayments')}>
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t('detail.title')}</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="truncate">{itemName}</CardTitle>
              <CardDescription className="mt-1">
                {t('detail.requestedOn')} {formatDateTime(request.created_at)}
              </CardDescription>
            </div>
            <Badge variant={statusBadge.variant} className="gap-1 shrink-0">
              {statusBadge.icon}
              {statusBadge.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Amount */}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('detail.amount')}</span>
            <span className="font-semibold">
              {new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: (request.payment_currency || 'usd').toUpperCase(),
              }).format(parseFloat(request.payment_amount || '0'))}
            </span>
          </div>

          <Separator />

          {/* Payment instructions */}
          {request.payment_instructions ? (
            <div className="space-y-4">
              {request.payment_method && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('detail.paymentMethod')}</p>
                  <p className="text-sm text-muted-foreground">{request.payment_method}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium mb-1">{t('detail.paymentInstructions')}</p>
                <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg whitespace-pre-wrap">
                  {request.payment_instructions}
                </p>
              </div>
              {request.payment_deadline && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconCalendar className="h-4 w-4" />
                  <span className="font-medium text-foreground">{t('detail.paymentDeadline')}:</span>
                  {formatDateTime(request.payment_deadline)}
                </div>
              )}
            </div>
          ) : (
            <Alert>
              <IconInfoCircle className="h-4 w-4" />
              <AlertDescription>{t('detail.noInstructionsYet')}</AlertDescription>
            </Alert>
          )}

          <Separator />

          {/* Proof of payment */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('detail.proofSection')}</p>
            {request.proof_url ? (
              <div className="flex items-center gap-3">
                <Badge variant="default" className="gap-1">
                  <IconCheck className="w-3 h-3" />
                  {t('detail.proofUploaded')}
                </Badge>
                <a href={request.proof_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline">{t('detail.viewProof')}</Button>
                </a>
              </div>
            ) : canCancel ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('detail.uploadHint')}</p>
                <StudentProofUpload requestId={request.request_id} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('detail.uploadHint')}</p>
            )}
          </div>

          {canCancel && (
            <>
              <Separator />
              <div className="flex justify-end">
                <CancelPaymentButton requestId={request.request_id} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
