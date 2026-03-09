import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenant } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { listMcpTokens } from '@/app/actions/mcp-tokens'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import ApiTokensPage from '@/components/dashboard/api-tokens-page'

export default async function AdminApiTokensPage() {
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const { data: tokens } = await listMcpTokens()
  const tenant = await getCurrentTenant()
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const mcpUrl = tenant?.slug
    ? `https://${tenant.slug}.${platformDomain}/api/mcp/cli`
    : `https://${platformDomain}/api/mcp/cli`

  const t = await getTranslations('dashboard.admin.apiTokens')

  return (
    <div className="min-h-screen bg-background" data-testid="api-tokens-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('apiTokens') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <ApiTokensPage tokens={tokens ?? []} mcpUrl={mcpUrl} />
      </main>
    </div>
  )
}
