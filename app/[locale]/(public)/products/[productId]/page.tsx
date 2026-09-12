import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ManualPaymentButton } from '@/components/student/manual-payment-button'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'
import { AlreadyHaveAccountLink } from '@/components/public/already-have-account-link'

export async function generateMetadata({
  params
}: {
  params: Promise<{ productId: string; locale: string }>
}): Promise<Metadata> {
  const { productId, locale } = await params
  const supabase = await createClient()
  const { data: product } = await supabase
    .from('products')
    .select('name, description')
    .eq('product_id', parseInt(productId))
    .eq('tenant_id', await getCurrentTenantId())
    .eq('status', 'active')
    .single()
  if (!product) return {}

  return buildPageMetadata({
    title: product.name,
    description: product.description?.replace(/\s+/g, ' ').trim().slice(0, 160) || undefined,
    path: `/products/${productId}`,
    locale,
  })
}

export default async function ProductDetailPage({
  params
}: {
  params: Promise<{ productId: string }>
}) {
  const supabase = await createClient()
  const t = await getTranslations('products')
  const tenantId = await getCurrentTenantId()
  const { productId: productIdStr } = await params
  const productId = parseInt(productIdStr)

  // Get product details. Scoped to this school: RLS on `products` is permissive
  // for `anon`, and the page is now served to anonymous visitors (#719), so the
  // tenant filter is the only thing keeping one subdomain out of another's
  // catalogue.
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('product_id', productId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (error || !product) {
    redirect('/products')
  }

  // Check if user is authenticated
  const userId = await getCurrentUserId()
  // Where an anonymous visitor lands once they have an account: back here, so
  // the payment request they came for is one click away.
  const anonymousNext = `/products/${product.product_id}`
  return (
    <div className="container mx-auto py-12">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{product.name}</CardTitle>
            <CardDescription className="text-lg">{product.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="text-4xl font-bold mb-2">
                ${product.price} {product.currency.toUpperCase()}
              </div>
              <div className="text-sm text-muted-foreground">
                {t('paymentMethod', {
                  provider:
                    product.payment_provider === 'manual' ? t('manual') : product.payment_provider,
                })}
              </div>
            </div>

            {product.payment_provider === 'manual' && (
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="font-semibold mb-2">{t('detail.manualTitle')}</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>{t('detail.manualSteps.request')}</li>
                  <li>{t('detail.manualSteps.instructions')}</li>
                  <li>{t('detail.manualSteps.pay')}</li>
                  <li>{t('detail.manualSteps.access')}</li>
                </ol>
              </div>
            )}

            <div className="pt-4">
              {userId ? (
                <ManualPaymentButton
                  productId={product.product_id}
                  productName={product.name}
                  productPrice={parseFloat(product.price)}
                  productCurrency={product.currency}
                />
              ) : (
                // A visitor who followed a shared product link most likely has
                // no account yet, so the button goes to sign-up; the link under
                // it carries the same `next` for the ones who do (#719).
                <div className="text-center space-y-2">
                  <Link
                    data-testid="product-request-cta"
                    href={`/auth/sign-up?next=${encodeURIComponent(anonymousNext)}`}
                  >
                    <Button>
                      {product.payment_provider === 'manual' ? t('requestPaymentInfo') : t('buyNow')}
                    </Button>
                  </Link>
                  <AlreadyHaveAccountLink next={anonymousNext} testId="product-request-login" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
