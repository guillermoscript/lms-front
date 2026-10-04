import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'seo' })
  return buildPageMetadata({ title: t('products.title'), description: t('products.description'), path: '/products', locale })
}

export default async function ProductsPage() {
  const supabase = await createClient()
  const t = await getTranslations('products')
  const tenantId = await getCurrentTenantId()

  // Get all active products for this school. The tenant filter is what makes
  // the page safe to serve anonymously (#719): RLS on `products` is permissive
  // for `anon`, so without it a subdomain listed every school's catalogue.
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return (
    <div className="container mx-auto py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((product) => (
          <Card key={product.product_id}>
            <CardHeader>
              <CardTitle>{product.name}</CardTitle>
              <CardDescription>{product.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                ${product.price} {product.currency.toUpperCase()}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {t('paymentMethod', {
                  provider:
                    product.payment_provider === 'manual' ? t('manual') : product.payment_provider,
                })}
              </div>
            </CardContent>
            <CardFooter>
              <Link href={`/products/${product.product_id}`} className="w-full">
                <Button className="w-full">
                  {product.payment_provider === 'manual' ? t('requestPaymentInfo') : t('buyNow')}
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>

      {(!products || products.length === 0) && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('empty')}</p>
        </div>
      )}
    </div>
  )
}
