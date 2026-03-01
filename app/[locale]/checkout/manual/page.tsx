import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { PaymentRequestForm } from '@/components/student/payment-request-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IconCreditCard, IconCurrencyDollar } from '@tabler/icons-react'

interface SearchParams {
  productId?: string
}

export default async function ManualCheckoutPage(props: {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  const { productId } = searchParams
  const t = await getTranslations('checkout.manual')

  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const returnUrl = encodeURIComponent(`/checkout/manual?productId=${productId}`)
    redirect(`/auth/login?next=${returnUrl}`)
  }

  // Validate productId
  if (!productId) {
    redirect('/dashboard/student/browse')
  }

  // Fetch product details with tenant filtering
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      product_id,
      name,
      description,
      price,
      currency,
      payment_provider
    `)
    .eq('product_id', productId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (error || !product) {
    redirect('/dashboard/student/browse')
  }

  // Verify product supports manual payments
  if (product.payment_provider !== 'manual') {
    redirect(`/checkout?courseId=${productId}`)
  }

  return (
    <div className="container py-12 px-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-3" data-testid="manual-checkout-title">{t('title')}</h1>
        <p className="text-muted-foreground text-lg">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 max-w-6xl mx-auto">
        {/* Left Column: Product Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconCreditCard className="w-5 h-5" />
                {t('productDetails')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
                {product.description && (
                  <p className="text-sm text-muted-foreground">{product.description}</p>
                )}
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('price')}:</span>
                  <div className="flex items-center gap-2">
                    <IconCurrencyDollar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">
                      {parseFloat(product.price).toFixed(2)} {product.currency?.toUpperCase() || 'USD'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Badge variant="secondary" className="w-full justify-center py-2">
                  {t('manualPayment')}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* How It Works */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('howItWorks.title')}</CardTitle>
              <CardDescription>{t('howItWorks.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    1
                  </span>
                  <span className="text-muted-foreground">{t('howItWorks.step1')}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    2
                  </span>
                  <span className="text-muted-foreground">{t('howItWorks.step2')}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </span>
                  <span className="text-muted-foreground">{t('howItWorks.step3')}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    4
                  </span>
                  <span className="text-muted-foreground">{t('howItWorks.step4')}</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Payment Request Form */}
        <div className="lg:col-span-3">
          <PaymentRequestForm
            productId={product.product_id}
            productName={product.name}
            price={parseFloat(product.price).toFixed(2)}
            currency={product.currency || 'usd'}
          />
        </div>
      </div>
    </div>
  )
}
