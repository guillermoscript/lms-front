import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ManualPaymentButton } from '@/components/student/manual-payment-button'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getLocale, getTranslations } from 'next-intl/server'
import { AlreadyHaveAccountLink } from '@/components/public/already-have-account-link'
import { FreeEnrollButton } from '@/components/public/free-enroll-button'
import { formatCurrency } from '@/lib/currency'

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
  const locale = await getLocale()
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

  // Price 0 is the free sentinel. The wizard's free mode still stores provider
  // `manual` (the column is NOT NULL), so the provider must not decide what a
  // free product page offers: it showed "Payment method: Manual" and the four
  // manual-payment steps for a $0 product (#727). Decided before any provider
  // branch; `createPaymentRequest()` rejects a $0 product server-side too.
  const isFree = !(Number(product.price) > 0)

  // Courses a signed-in visitor can enroll in for free. `product_courses` can
  // hold many rows per product — never `.single()`.
  let freeCourses: { course_id: number; title: string }[] = []
  if (isFree && userId) {
    const { data: links } = await supabase
      .from('product_courses')
      .select('course:courses(course_id, title, status)')
      .eq('product_id', product.product_id)
      .eq('tenant_id', tenantId)
    freeCourses = (links || [])
      .map((link) => link.course as unknown as { course_id: number; title: string; status: string } | null)
      .filter((course): course is { course_id: number; title: string; status: string } =>
        course != null && course.status === 'published'
      )
      .map(({ course_id, title }) => ({ course_id, title }))
  }

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
              <div className="text-4xl font-bold mb-2 tabular-nums" data-testid="product-price">
                {isFree ? t('free') : formatCurrency(Number(product.price), product.currency || 'usd', locale)}
              </div>
              {isFree ? (
                <div className="text-sm text-muted-foreground">{t('detail.freeDescription')}</div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {t('paymentMethod', {
                    provider:
                      product.payment_provider === 'manual' ? t('manual') : product.payment_provider,
                  })}
                </div>
              )}
            </div>

            {!isFree && product.payment_provider === 'manual' && (
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
              {isFree && userId ? (
                freeCourses.length > 0 ? (
                  <div className="space-y-4" data-testid="product-free-enroll">
                    {freeCourses.map((course) => (
                      <div key={course.course_id} className="space-y-2">
                        {freeCourses.length > 1 && (
                          <p className="text-sm font-medium">{course.title}</p>
                        )}
                        <FreeEnrollButton courseId={course.course_id} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('detail.noCourses')}</p>
                )
              ) : userId ? (
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
                      {isFree
                        ? t('enrollFree')
                        : product.payment_provider === 'manual'
                          ? t('requestPaymentInfo')
                          : t('buyNow')}
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
