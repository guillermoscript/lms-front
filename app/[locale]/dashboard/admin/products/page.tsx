import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
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
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

export default async function AdminProductsPage() {
  const t = await getTranslations('dashboard.admin.products')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) {
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
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: tBreadcrumbs('products') },
              ]}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
            </div>
            <Link href="/dashboard/admin/products/new">
              <Button size="sm" className="gap-2">
                <IconPlus className="h-4 w-4" />
                {t('create')}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.total')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{products?.length || 0}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                  <IconShoppingCart className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.active')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{activeCount}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                  <IconShoppingCart className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.archived')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{inactiveCount}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                  <IconArchive className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
                </div>
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
                          <Badge
                            variant={isActive ? 'default' : 'secondary'}
                            className={`text-[10px] ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}`}
                          >
                            {t(`card.status.${product.status}`)}
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
                      <p className="text-2xl font-bold tracking-tight tabular-nums">
                        {product.currency === 'usd' ? '$' : '€'}
                        {product.price.toFixed(2)}
                      </p>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <IconShoppingCart className="h-5 w-5 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm font-medium mb-1">{t('empty.title')}</p>
                  <p className="text-xs text-muted-foreground mb-4">
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
