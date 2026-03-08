import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentTenant } from '@/lib/supabase/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { LandingPageRenderer } from '@/components/public/landing-page/landing-page-renderer'
import { Navbar } from '@/components/public/navbar'
import { Footer } from '@/components/public/footer'
import { PreviewBanner } from '@/components/admin/landing-page/preview-banner'
import type { LandingPage, LandingPageSettings } from '@/lib/landing-pages/types'

interface Props {
  params: Promise<{ pageId: string; locale: string }>
  searchParams: Promise<{ iframe?: string }>
}

export default async function PreviewPage({ params, searchParams }: Props) {
  const [{ pageId }, search] = await Promise.all([params, searchParams])
  const isIframe = search.iframe === 'true'

  const [role, tenantId, tenant] = await Promise.all([
    getUserRole(),
    getCurrentTenantId(),
    getCurrentTenant(),
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

  const landingPage = page as unknown as LandingPage
  const settings = (landingPage.settings ?? {}) as LandingPageSettings

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {!isIframe && (
        <PreviewBanner status={landingPage.status} />
      )}
      {settings.header !== undefined && (
        <Navbar headerSettings={settings.header} />
      )}
      <div className={!isIframe && settings.header !== undefined ? 'pt-16' : ''}>
        <LandingPageRenderer
          sections={landingPage.sections}
          accentColor={tenant?.primary_color}
        />
      </div>
      {settings.footer && (
        <Footer footerSettings={settings.footer} />
      )}
    </div>
  )
}
