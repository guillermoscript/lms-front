import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { IconArrowLeft } from '@tabler/icons-react'
import { ProductForm } from '@/components/admin/product-form'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export default async function NewProductPage() {
  const t = await getTranslations('dashboard.admin.products.new')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = await createClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Fetch published courses for the selector
  const { data: courses } = await supabase
    .from('courses')
    .select('course_id, title')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('title')

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: tBreadcrumbs('products'), href: '/dashboard/admin/products' },
                { label: tBreadcrumbs('newProduct') },
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
            <CardTitle>{t('details.title')}</CardTitle>
            <CardDescription>
              {t('details.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductForm mode="create" courses={courses || []} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
