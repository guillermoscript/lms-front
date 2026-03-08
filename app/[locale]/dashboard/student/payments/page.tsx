import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Link from 'next/link'
import {
  IconReceipt,
  IconAlertCircle,
  IconClock,
  IconCheck,
  IconX,
  IconMail,
  IconCreditCard,
  IconInfoCircle,
} from '@tabler/icons-react'
import { CancelPaymentButton } from '@/components/student/cancel-payment-button'
import { StudentProofUpload } from './student-proof-upload'

export default async function StudentPaymentsPage() {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.student.payments')

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch user's payment requests
  const { data: paymentRequests } = await supabase
    .from('payment_requests')
    .select(`
      request_id,
      created_at,
      status,
      contact_name,
      contact_email,
      contact_phone,
      message,
      payment_amount,
      payment_currency,
      payment_method,
      payment_instructions,
      payment_deadline,
      proof_url,
      product:products (
        product_id,
        name
      )
    `)
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          variant: 'secondary' as const,
          icon: <IconClock className="w-3 h-3" />,
          label: t('status.pending'),
        }
      case 'contacted':
        return {
          variant: 'default' as const,
          icon: <IconMail className="w-3 h-3" />,
          label: t('status.contacted'),
        }
      case 'payment_received':
        return {
          variant: 'default' as const,
          icon: <IconCreditCard className="w-3 h-3" />,
          label: t('status.paymentReceived'),
        }
      case 'completed':
        return {
          variant: 'default' as const,
          icon: <IconCheck className="w-3 h-3" />,
          label: t('status.completed'),
        }
      case 'cancelled':
        return {
          variant: 'destructive' as const,
          icon: <IconX className="w-3 h-3" />,
          label: t('status.cancelled'),
        }
      default:
        return {
          variant: 'secondary' as const,
          icon: <IconAlertCircle className="w-3 h-3" />,
          label: status,
        }
    }
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateString))
  }

  const formatDateTime = (dateString: string) => {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString))
  }

  const canCancel = (status: string) => {
    return status === 'pending' || status === 'contacted'
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl" data-testid="payments-page">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <IconReceipt className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight" data-testid="payments-title">{t('title')}</h1>
        </div>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Payment Requests */}
      {!paymentRequests || paymentRequests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-muted p-4 rounded-full">
                <IconReceipt className="w-8 h-8 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">{t('empty.title')}</h3>
            <p className="text-muted-foreground mb-6">{t('empty.description')}</p>
            <Link href="/dashboard/student/browse">
              <Button>{t('empty.browseCourses')}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Info Alert */}
          <Alert>
            <IconInfoCircle className="h-4 w-4" />
            <AlertDescription>{t('infoMessage')}</AlertDescription>
          </Alert>

          {/* Desktop View: Table */}
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle>{t('tableTitle')}</CardTitle>
              <CardDescription>
                {t('tableDescription', { count: paymentRequests.length })}
              </CardDescription>
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
                  {paymentRequests.map((request) => {
                    const statusBadge = getStatusBadge(request.status)
                    const product = request.product as any

                    return (
                      <TableRow key={request.request_id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{product?.name || t('unknownProduct')}</TableCell>
                        <TableCell>
                          {new Intl.NumberFormat(undefined, { style: 'currency', currency: request.payment_currency || 'USD' }).format(parseFloat(request.payment_amount || '0'))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadge.variant} className="gap-1">
                            {statusBadge.icon}
                            {statusBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(request.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {request.payment_instructions && (
                              <Link href={`/dashboard/student/payments/${request.request_id}`}>
                                <Button size="sm" variant="outline">
                                  {t('viewDetails')}
                                </Button>
                              </Link>
                            )}
                            {request.proof_url ? (
                              <a href={request.proof_url} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="ghost">
                                  {t('viewProof')}
                                </Button>
                              </a>
                            ) : canCancel(request.status) ? (
                              <StudentProofUpload requestId={request.request_id} />
                            ) : null}
                            {canCancel(request.status) && (
                              <CancelPaymentButton requestId={request.request_id} />
                            )}
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
            {paymentRequests.map((request) => {
              const statusBadge = getStatusBadge(request.status)
              const product = request.product as any

              return (
                <Card key={request.request_id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{product?.name || t('unknownProduct')}</CardTitle>
                        <CardDescription className="mt-1">
                          {formatDateTime(request.created_at)}
                        </CardDescription>
                      </div>
                      <Badge variant={statusBadge.variant} className="gap-1">
                        {statusBadge.icon}
                        {statusBadge.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('amount')}:</span>
                      <span className="font-semibold">
                        {request.payment_currency?.toUpperCase() || 'USD'}{' '}
                        {parseFloat(request.payment_amount || '0').toFixed(2)}
                      </span>
                    </div>

                    {request.payment_instructions && (
                      <Alert>
                        <IconInfoCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          {t('instructionsAvailable')}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex gap-2 pt-2">
                      {request.payment_instructions && (
                        <Link href={`/dashboard/student/payments/${request.request_id}`} className="flex-1">
                          <Button size="sm" variant="outline" className="w-full">
                            {t('viewDetails')}
                          </Button>
                        </Link>
                      )}
                      {request.proof_url ? (
                        <a href={request.proof_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost">
                            {t('viewProof')}
                          </Button>
                        </a>
                      ) : canCancel(request.status) ? (
                        <StudentProofUpload requestId={request.request_id} />
                      ) : null}
                      {canCancel(request.status) && (
                        <CancelPaymentButton requestId={request.request_id} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
