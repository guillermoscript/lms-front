import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getLandingPages } from '@/app/actions/admin/landing-pages'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { LandingPagesClient } from '@/components/admin/landing-page/landing-pages-client'
import { createClient } from '@/lib/supabase/server'
import { BUILT_IN_TEMPLATES } from '@/lib/landing-pages/templates'

export default async function LandingPageAdminPage() {
  const role = await getUserRole()
  if (role !== 'admin') redirect('/dashboard/admin')

  const tenantId = await getCurrentTenantId()

  // Check plan
  const supabase = await createClient()
  const { data: planResult } = await supabase.rpc('get_plan_features', { _tenant_id: tenantId })
  const plan = (planResult as any)?.plan ?? 'free'

  const pagesResult = await getLandingPages(tenantId)
  const pages = pagesResult.success ? (pagesResult.data ?? []) : []

  return (
    <div className="flex flex-col gap-6 p-6">
      <AdminBreadcrumb
        items={[
          { label: 'Admin', href: '/dashboard/admin' },
          { label: 'Landing Page Builder' },
        ]}
      />
      <LandingPagesClient
        pages={pages}
        plan={plan}
        tenantId={tenantId}
        templates={BUILT_IN_TEMPLATES}
      />
    </div>
  )
}
