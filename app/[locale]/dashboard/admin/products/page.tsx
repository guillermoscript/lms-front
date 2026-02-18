import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  IconArrowLeft,
  IconPlus,
  IconShoppingCart,
  IconEdit,
  IconArchive,
  IconRestore
} from '@tabler/icons-react'
import { ProductActions } from '@/components/admin/product-actions'

export default async function AdminProductsPage() {
  const t = await getTranslations('dashboard.admin.products')
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get all products with course counts
  const { data: products } = await supabase
    .from('products')
    .select(`
      *,
      product_courses (
        course_id,
        course:courses (
          course_id,
          title
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  const activeCount = products?.filter(p => p.status === 'active').length || 0
  const inactiveCount = products?.filter(p => p.status === 'inactive').length || 0

  return (
    <div className="min-h-screen bg-background" data-testid="products-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              {t('back')}
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
              <p className="mt-1 text-muted-foreground">
                {t('description')}
              </p>
            </div>
            <Link href="/dashboard/admin/products/new">
              <Button>
                <IconPlus className="mr-2 h-4 w-4" />
                {t('create')}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.total')}</p>
                  <p className="mt-2 text-3xl font-bold">{products?.length || 0}</p>
                </div>
                <IconShoppingCart className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.active')}</p>
                  <p className="mt-2 text-3xl font-bold">{activeCount}</p>
                </div>
                <IconShoppingCart className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.archived')}</p>
                  <p className="mt-2 text-3xl font-bold">{inactiveCount}</p>
                </div>
                <IconArchive className="h-10 w-10 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Products Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {products && products.length > 0 ? (
            products.map((product) => {
              const courseCount = product.product_courses?.length || 0
              const isActive = product.status === 'active'

              return (
                <Card key={product.product_id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="line-clamp-2">{product.name}</CardTitle>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant={isActive ? 'default' : 'secondary'}>
                            {product.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {courseCount} {courseCount === 1 ? t('card.course') : t('card.courses')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                      {product.description || t('card.noDescription')}
                    </p>
                    <div className="mb-4">
                      <p className="text-2xl font-bold">
                        {product.currency === 'usd' ? '$' : '€'}
                        {product.price.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground text-uppercase">
                        {product.currency}
                      </p>
                    </div>

                    {/* Course List */}
                    {product.product_courses && product.product_courses.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {t('card.includedCourses')}
                        </p>
                        <ul className="space-y-1">
                          {product.product_courses.slice(0, 3).map((pc: any) => (
                            <li key={pc.course_id} className="text-xs text-muted-foreground truncate">
                              • {pc.course?.title}
                            </li>
                          ))}
                          {product.product_courses.length > 3 && (
                            <li className="text-xs text-muted-foreground">
                              • {t('card.more', { count: product.product_courses.length - 3 })}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link href={`/dashboard/admin/products/${product.product_id}/edit`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <IconEdit className="mr-1 h-4 w-4" />
                          {t('card.edit')}
                        </Button>
                      </Link>
                      <ProductActions
                        productId={product.product_id}
                        productName={product.name}
                        isActive={isActive}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })
          ) : (
            <div className="col-span-full">
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <IconShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">{t('empty.title')}</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('empty.description')}
                  </p>
                  <Link href="/dashboard/admin/products/new">
                    <Button>
                      <IconPlus className="mr-2 h-4 w-4" />
                      {t('create')}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
