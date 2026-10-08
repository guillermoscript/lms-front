import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCurrency } from '@/lib/currency'
import { formatDateTime as formatInZone } from '@/lib/format-date-time'
import { getTenantTimeZone } from '@/lib/tenant-timezone'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Link from 'next/link'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { IconReceipt, IconInfoCircle } from '@tabler/icons-react'
import { PaymentsExplorer, type PaymentRow } from '@/components/student/payments-explorer'
import {
  PostRegistrationSteps,
  type PostRegistrationStep,
} from '@/components/student/post-registration-steps'

export default async function StudentPaymentsPage() {
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.student.payments')
  // Explicit locale + the school's zone: the server runs in UTC, so
  // `Intl.DateTimeFormat(undefined, …)` showed a different time than the
  // admin saw, with English month names on /es (#727).
  const [locale, timeZone] = await Promise.all([getLocale(), getTenantTimeZone(tenantId)])

  // Get authenticated user
  const userId = await getCurrentUserId()
  if (!userId) {
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
      ),
      plan:plans (
        plan_id,
        plan_name
      )
    `)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  // Post-purchase instructions for completed purchases: the buyer should see
  // the steps the admin configured (WhatsApp/Telegram/Discord/link/text).
  const completedProductIds = Array.from(
    new Set(
      (paymentRequests || [])
        .filter((request) => request.status === 'completed')
        .map((request) => (request.product as { product_id?: number } | null)?.product_id)
        .filter((id): id is number => typeof id === 'number')
    )
  )

  const { data: postRegistrationRows } = completedProductIds.length
    ? await supabase
        .from('product_post_registration_steps')
        .select('id, product_id, type, title, description, url, sort_order')
        .in('product_id', completedProductIds)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order')
    : { data: [] }

  const stepsByProduct = new Map<number, PostRegistrationStep[]>()
  for (const row of (postRegistrationRows || []) as Array<
    PostRegistrationStep & { product_id: number }
  >) {
    const list = stepsByProduct.get(row.product_id) || []
    list.push(row)
    stepsByProduct.set(row.product_id, list)
  }

  // A manual request buys either a product or a plan (`product_id` NULL), so
  // name it by whichever it references — same fallback as the detail page.
  const itemName = (request: { product: unknown; plan: unknown }) =>
    (request.product as { name?: string } | null)?.name ||
    (request.plan as { plan_name?: string } | null)?.plan_name ||
    t('unknownProduct')

  const completedWithSteps = (paymentRequests || [])
    .filter((request) => request.status === 'completed')
    .map((request) => {
      const product = request.product as { product_id?: number; name?: string } | null
      return {
        requestId: request.request_id,
        productName: itemName(request),
        steps: product?.product_id ? stepsByProduct.get(product.product_id) || [] : [],
      }
    })
    .filter((entry) => entry.steps.length > 0)

  const rows: PaymentRow[] = (paymentRequests || []).map((request) => ({
    requestId: request.request_id,
    itemName: itemName(request),
    status: request.status,
    createdAt: request.created_at,
    amountValue: Number(request.payment_amount ?? 0),
    amountText: formatCurrency(
      Number(request.payment_amount ?? 0),
      request.payment_currency || 'usd',
      locale
    ),
    dateText: formatInZone(request.created_at, { locale, timeZone, precision: 'date' }),
    dateTimeText: formatInZone(request.created_at, { locale, timeZone }),
    hasInstructions: !!request.payment_instructions,
    proofUrl: request.proof_url,
  }))

  return (
    <PageShell variant="form" data-testid="payments-page">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <IconReceipt className="w-6 h-6 text-brand-text" />
            <span data-testid="payments-title">{t('title')}</span>
          </span>
        }
        description={t('subtitle')}
      />

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

          {/* Post-purchase next steps for completed purchases */}
          {completedWithSteps.map((entry) => (
            <PostRegistrationSteps
              key={entry.requestId}
              steps={entry.steps}
              title={t('nextSteps.title')}
              description={t('nextSteps.description', { product: entry.productName })}
              openLabel={t('nextSteps.open')}
            />
          ))}

          <PaymentsExplorer rows={rows} />
        </div>
      )}
    </PageShell>
  )
}
