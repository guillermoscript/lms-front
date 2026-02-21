import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { IconArrowLeft, IconFolderOpen } from '@tabler/icons-react'
import { CategoriesTable } from '@/components/admin/categories-table'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

export default async function AdminCategoriesPage() {
  const t = await getTranslations('dashboard.admin.categories')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Get all categories with course counts
  const { data: categories } = await supabase
    .from('course_categories')
    .select(`
      *,
      courses (count)
    `)
    .eq('tenant_id', tenantId)
    .order('name')

  return (
    <div className="min-h-screen bg-background" data-testid="categories-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('categories') },
              ]}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
              <p className="mt-1 text-muted-foreground">
                {t('description')}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.total')}</p>
                  <p className="mt-2 text-3xl font-bold">{categories?.length || 0}</p>
                </div>
                <IconFolderOpen className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Categories Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('table.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoriesTable categories={categories || []} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
