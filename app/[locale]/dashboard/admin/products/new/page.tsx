import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { ProductCreationWizard } from '@/components/admin/product-creation-wizard'
import { getEnabledPaymentProviders } from '@/app/actions/admin/settings'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

// The one-screen quick create + AI generator moved to
// /dashboard/admin/courses/new (#665) so "create a course" has a single home.
// This page is the full product wizard: existing course, providers, currency,
// after-purchase steps. `?advanced=1` links from before the move still land here.
export default async function NewProductPage() {
  const t = await getTranslations('dashboard.admin.products.new')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const breadcrumb = (
    <AdminBreadcrumb
      items={[
        { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
        { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
        { label: tBreadcrumbs('products'), href: '/dashboard/admin/products' },
        { label: tBreadcrumbs('newProduct') },
      ]}
    />
  )

  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()

  const [{ data: courses }, { data: categories }] = await Promise.all([
    supabase
      .from('courses')
      .select('course_id, title, description, thumbnail_url, category_id, status')
      .eq('tenant_id', tenantId)
      .order('title'),
    supabase
      .from('course_categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name'),
  ])

  const { data: enabledProviders } = await getEnabledPaymentProviders()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('stripe_account_id')
    .eq('id', tenantId)
    .single()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">{breadcrumb}</div>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">
              {t('description')}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <ProductCreationWizard
          mode="create"
          categories={categories || []}
          courses={courses || []}
          enabledProviders={enabledProviders}
          stripeConnected={Boolean(tenant?.stripe_account_id)}
        />

      </main>
    </div>
  )
}
