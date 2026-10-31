import { withSlug } from '@/lib/slug'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { IconCircleCheckFilled } from '@tabler/icons-react'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import 'dayjs/locale/en'
import 'dayjs/locale/es'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckoutProcessing } from '@/components/public/checkout-processing'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

dayjs.extend(localizedFormat)

interface CheckoutSuccessPageProps {
  searchParams: Promise<{ transactionId?: string; type?: string }>
}

// Post-purchase confirmation, unique per transaction and worth nothing in
// search — title only, kept out of the index (#799).
export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'seo' })
  return buildPageMetadata({
    title: t('checkoutSuccess.title'),
    path: '/checkout/success',
    locale,
    noIndex: true,
  })
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { transactionId: transactionIdParam, type } = await searchParams
  const transactionId = Number(transactionIdParam)

  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
    return <SuccessCard primaryHref={type === 'plan' ? '/dashboard/student/browse' : '/dashboard/student/courses'} />
  }

  const [supabase, tenantId] = await Promise.all([createClient(), getCurrentTenantId()])
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/checkout/success?transactionId=${transactionId}`)}`)
  }

  const { data: transaction } = await supabase
    .from('transactions')
    .select('transaction_id, status, product_id, plan_id, amount, currency, payment_method, payment_provider, provider_charge_id, transaction_date')
    .eq('transaction_id', transactionId)
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single()

  if (!transaction) {
    redirect('/dashboard/student')
  }

  if (transaction.status === 'pending') {
    return <CheckoutProcessing />
  }

  if (transaction.status !== 'successful') {
    redirect('/dashboard/student/billing')
  }

  const t = await getTranslations('checkout.success')
  const isPlan = transaction.plan_id !== null
  const [{ data: plan }, { data: product }, { data: productCourses }] = await Promise.all([
    isPlan
      ? supabase.from('plans').select('plan_name').eq('plan_id', transaction.plan_id!).eq('tenant_id', tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
    transaction.product_id
      ? supabase.from('products').select('name').eq('product_id', transaction.product_id).eq('tenant_id', tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
    transaction.product_id
      ? supabase.from('product_courses').select('course_id, course:courses(title)').eq('product_id', transaction.product_id).eq('tenant_id', tenantId).order('course_id')
      : Promise.resolve({ data: [] }),
  ])

  const courses = (productCourses ?? []).map(({ course_id, course }) => ({
    courseId: course_id,
    title: (course as unknown as { title: string } | null)?.title,
  }))
  const itemName = isPlan ? plan?.plan_name : product?.name
  const primaryHref = isPlan
    ? '/dashboard/student/browse?checkout=success'
    : courses.length === 1
      ? `/dashboard/student/courses/${withSlug(courses[0].courseId, courses[0].title)}`
      : '/dashboard/student/courses'
  const currentLocale = await getLocale()
  const paymentProvider = (transaction.payment_provider ?? transaction.payment_method ?? '').toLowerCase()
  const paymentMethods: Record<string, string> = {
    stripe: t('paymentMethods.stripe'),
    paypal: t('paymentMethods.paypal'),
    binance: t('paymentMethods.binance'),
    binance_personal: t('paymentMethods.binancePersonal'),
    manual: t('paymentMethods.manual'),
    lemonsqueezy: t('paymentMethods.lemonsqueezy'),
    solana: t('paymentMethods.solanaPay'),
    solana_subs: t('paymentMethods.solanaSubscription'),
  }
  const paymentMethod = paymentMethods[paymentProvider] ?? t('unknownPaymentMethod')
  const purchaseName = (itemName ?? (isPlan ? t('planFallback') : t('productFallback')))
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/g, (date: string) =>
      dayjs(date).locale(currentLocale).format('lll'),
    )
  const formattedDate = dayjs(transaction.transaction_date).locale(currentLocale).format('lll')

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-16">
      <Card className="w-full border-border shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 px-6 py-8 text-center sm:px-8 sm:py-10">
          <SuccessIcon />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t('paymentSuccessful')}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('receiptSubtitle')}</p>
          </div>
          <div className="w-full rounded-lg border bg-muted/30 p-4 text-left sm:p-5">
            <h2 className="mb-4 text-sm font-semibold">{t('orderSummary')}</h2>
            <dl className="space-y-3 text-sm">
              <ReceiptRow label={t('itemLabel')} value={purchaseName} />
              <ReceiptRow label={t('orderNumber')} value={`#${transaction.transaction_id}`} />
              <ReceiptRow label={t('paid')} value={new Intl.NumberFormat(currentLocale, { style: 'currency', currency: (transaction.currency ?? 'USD').toUpperCase() }).format(transaction.amount)} strong />
              <ReceiptRow label={t('paymentMethod')} value={paymentMethod} />
              <ReceiptRow label={t('paymentDate')} value={formattedDate} />
              {transaction.provider_charge_id ? <ReceiptRow label={t('paymentReference')} value={transaction.provider_charge_id} mono /> : null}
            </dl>
          </div>
          <div className="flex w-full flex-col gap-3">
            <Link href={primaryHref} className="w-full">
              <Button className="w-full">{t(isPlan || courses.length !== 1 ? 'continueToCourses' : 'startLearning')}</Button>
            </Link>
            {courses.length > 1 ? (
              <div className="flex w-full flex-col gap-2 pt-1">
                <p className="text-sm text-muted-foreground">{t('multipleCourses')}</p>
                {courses.map((course) => (
                  <Link key={course.courseId} href={`/dashboard/student/courses/${withSlug(course.courseId, course.title)}`}>
                    <Button variant="outline" className="w-full">{course.title ?? t('courseFallback')}</Button>
                  </Link>
                ))}
              </div>
            ) : null}
            <Link href="/dashboard/student/billing" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              {t('viewOrderHistory')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReceiptRow({ label, value, strong = false, mono = false }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 max-w-[65%] text-right [overflow-wrap:anywhere] ${strong ? 'font-semibold text-foreground' : 'font-medium'} ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

async function SuccessCard({ primaryHref }: { primaryHref: string }) {
  const t = await getTranslations('checkout.success')

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 px-8 py-10 text-center">
          <SuccessIcon />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('subtitle')}</p>
          </div>
          <Link href={primaryHref} className="w-full">
            <Button className="w-full">{t('continue')}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function SuccessIcon() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
      <IconCircleCheckFilled className="h-9 w-9 text-success" />
    </div>
  )
}
