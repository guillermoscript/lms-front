import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getLandingPages } from '@/app/actions/admin/landing-pages'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { LandingPagesClient } from '@/components/admin/landing-page/landing-pages-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUCK_TEMPLATES } from '@/lib/puck/templates'
import { getTranslations } from 'next-intl/server'

export default async function LandingPageAdminPage() {
  const role = await getUserRole()
  if (role !== 'admin') redirect('/dashboard/admin')

  const t = await getTranslations('landingPageBuilder')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const tenantId = await getCurrentTenantId()

  // Check plan
  const supabase = createAdminClient()
  const { data: planResult } = await supabase.rpc('get_plan_features', { _tenant_id: tenantId })
  const plan = (planResult as any)?.plan ?? 'free'

  const pagesResult = await getLandingPages(tenantId)
  const pages = pagesResult.success ? (pagesResult.data ?? []) : []

  return (
    <div className="min-h-screen bg-background">
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <LandingPagesClient
          pages={pages}
          plan={plan}
          tenantId={tenantId}
          templates={PUCK_TEMPLATES}
        />
      </main>
    </div>
  )
}
