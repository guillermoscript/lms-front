import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId, getSessionUser } from '@/lib/supabase/tenant'
import { PaymentRequestForm } from '@/components/student/payment-request-form'
import { IconShieldCheck, IconLock } from '@tabler/icons-react'

interface SearchParams {
  productId?: string
  planId?: string
}

export default async function ManualCheckoutPage(props: {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  const { locale } = await props.params
  const { productId, planId } = searchParams
  const t = await getTranslations('checkout.manual')
  const tenantId = await getCurrentTenantId()

  const supabase = await createClient()

  // Get authenticated user (no network call — reads from cookie)
  const user = await getSessionUser()
  if (!user) {
    const returnParam = productId ? `productId=${productId}` : `planId=${planId}`
    const returnUrl = encodeURIComponent(`/checkout/manual?${returnParam}`)
    redirect(`/auth/login?next=${returnUrl}`)
  }

  // Must have either productId or planId
  if (!productId && !planId) {
    redirect('/dashboard/student/browse')
  }

  let itemName: string
  let itemDescription: string | null = null
  let itemPrice: number
  let itemCurrency: string
  let formProductId: number | undefined
  let formPlanId: number | undefined

  if (planId) {
    // Fetch plan details with tenant filtering
    const { data: plan, error } = await supabase
      .from('plans')
      .select('plan_id, plan_name, description, price, currency, payment_provider, duration_in_days')
      .eq('plan_id', planId)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !plan) {
      redirect('/dashboard/student/browse')
    }

    if (plan.payment_provider !== 'manual') {
      redirect(`/checkout?planId=${planId}`)
    }

    itemName = plan.plan_name
    itemDescription = plan.description
    itemPrice = parseFloat(plan.price)
    itemCurrency = plan.currency || 'usd'
    formPlanId = plan.plan_id
  } else {
    // Fetch product details with tenant filtering
    const { data: product, error } = await supabase
      .from('products')
      .select('product_id, name, description, price, currency, payment_provider')
      .eq('product_id', productId!)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .single()

    if (error || !product) {
      redirect('/dashboard/student/browse')
    }

    if (product.payment_provider !== 'manual') {
      redirect(`/checkout?courseId=${productId}`)
    }

    itemName = product.name
    itemDescription = product.description
    itemPrice = parseFloat(product.price)
    itemCurrency = product.currency || 'usd'
    formProductId = product.product_id
  }

  // Get user profile for pre-filling the form
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const userEmail = user.email || ''
  const userName = profile?.full_name || ''

  const formattedPrice = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: itemCurrency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(itemPrice)

  const steps = [
    t('howItWorks.step1'),
    t('howItWorks.step2'),
    t('howItWorks.step3'),
    t('howItWorks.step4'),
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:py-16">
        {/* Checkout grid */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">

          {/* ─── Left: Order summary ─── */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-8">
              {/* Eyebrow */}
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t('title')}
              </p>

              {/* Item name */}
              <h1
                className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl"
                data-testid="manual-checkout-title"
              >
                {itemName}
              </h1>

              {itemDescription && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {itemDescription}
                </p>
              )}

              {/* Price block */}
              <div className="mt-8 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {formattedPrice}
                </span>
              </div>

              {/* Divider */}
              <div className="my-8 h-px bg-border" />

              {/* How it works — minimal vertical timeline */}
              <div>
                <h2 className="text-sm font-semibold">{t('howItWorks.title')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('howItWorks.description')}
                </p>

                <ol className="mt-5 space-y-4">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="text-sm leading-snug text-muted-foreground">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Trust signals */}
              <div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <IconLock className="h-3.5 w-3.5" />
                  {t('manualPayment')}
                </span>
                <span className="flex items-center gap-1.5">
                  <IconShieldCheck className="h-3.5 w-3.5" />
                  {t('subtitle')}
                </span>
              </div>
            </div>
          </div>

          {/* ─── Right: Payment request form ─── */}
          <div className="lg:col-span-7">
            <PaymentRequestForm
              productId={formProductId}
              planId={formPlanId}
              productName={itemName}
              price={formattedPrice}
              currency={itemCurrency}
              userName={userName}
              userEmail={userEmail}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
