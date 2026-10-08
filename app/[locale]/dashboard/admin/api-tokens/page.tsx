import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenant, getCurrentUserId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { getUserSchools } from '@/lib/mcp/user-schools'
import ApiTokensPage from '@/components/dashboard/api-tokens-page'

export default async function AdminApiTokensPage() {
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const userId = await getCurrentUserId()
  const schools = userId ? await getUserSchools(userId) : []
  const tenant = await getCurrentTenant()
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const mcpUrl = tenant?.slug
    ? `https://${tenant.slug}.${platformDomain}/api/mcp`
    : `https://${platformDomain}/api/mcp`

  return (
    <div className="min-h-screen bg-background" data-testid="api-tokens-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <AdminBreadcrumb
            items={[
              { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
              { label: tBreadcrumbs('apiTokens') },
            ]}
          />
        </div>
      </header>

      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        <ApiTokensPage mcpUrl={mcpUrl} schools={schools} />
      </main>
    </div>
  )
}
