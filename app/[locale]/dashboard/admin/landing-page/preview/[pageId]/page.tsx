import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { PuckPageRenderer } from '@/components/public/landing-page/puck-page-renderer'
import { PreviewBanner } from '@/components/admin/landing-page/preview-banner'

interface Props {
  params: Promise<{ pageId: string; locale: string }>
  searchParams: Promise<{ iframe?: string }>
}

export default async function PreviewPage({ params, searchParams }: Props) {
  const [{ pageId }, search] = await Promise.all([params, searchParams])
  const isIframe = search.iframe === 'true'

  const [role, tenantId] = await Promise.all([
    getUserRole(),
    getCurrentTenantId(),
  ])

  if (role !== 'admin') {
    redirect('/dashboard/student')
  }

  const adminClient = createAdminClient()
  const { data: page } = await adminClient
    .from('landing_pages')
    .select('*')
    .eq('id', pageId)
    .single()

  if (!page || page.tenant_id !== tenantId) {
    redirect('/dashboard/admin/landing-page')
  }

  const puckData = page.puck_data as any
  if (!puckData || typeof puckData !== 'object') {
    redirect('/dashboard/admin/landing-page')
  }

  return (
    <div className="min-h-screen">
      {!isIframe && <PreviewBanner status={page.status} />}
      <PuckPageRenderer data={puckData} />
    </div>
  )
}
