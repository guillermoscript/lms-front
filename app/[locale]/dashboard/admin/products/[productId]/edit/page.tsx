import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { IconArrowLeft } from '@tabler/icons-react'
import { ProductForm } from '@/components/admin/product-form'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ productId: string }>
}

export default async function EditProductPage({ params }: PageProps) {
  const t = await getTranslations('dashboard.admin.products.edit')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const { productId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Fetch product with courses (tenant-scoped)
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      *,
      product_courses (
        course_id
      )
    `)
    .eq('product_id', parseInt(productId))
    .eq('tenant_id', tenantId)
    .single()

  if (error || !product) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('products'), href: '/dashboard/admin/products' },
                { label: tBreadcrumbs('editProduct') },
              ]}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">
              {t('description')}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>{product.name}</CardTitle>
            <CardDescription>
              {t('details.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductForm mode="edit" initialData={product} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
