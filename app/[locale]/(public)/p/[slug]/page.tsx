import { notFound } from 'next/navigation'
import { getCurrentTenantId, getCurrentTenant } from '@/lib/supabase/tenant'
import { createClient } from '@/lib/supabase/server'
import { LandingPageRenderer } from '@/components/public/landing-page/landing-page-renderer'
import type { LandingSection, LandingPageSettings } from '@/lib/landing-pages/types'
import type { Metadata } from 'next'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const PAID_PLANS = ['starter', 'pro', 'business', 'enterprise']

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getPageData(slug: string) {
  const tenantId = await getCurrentTenantId()
  if (tenantId === DEFAULT_TENANT_ID) return null

  const tenant = await getCurrentTenant()
  if (!tenant || !PAID_PLANS.includes(tenant.plan)) return null

  const supabase = await createClient()
  const { data: page } = await supabase
    .from('landing_pages')
    .select('sections, settings')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('status', 'published')
    .maybeSingle()

  if (!page || !Array.isArray(page.sections) || page.sections.length === 0) return null
  return { page, tenant }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const result = await getPageData(slug)
  if (!result) return {}
  const settings = result.page.settings as LandingPageSettings | null
  return {
    title: settings?.metaTitle || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: settings?.metaDescription,
    openGraph: settings?.ogImage ? { images: [settings.ogImage] } : undefined,
  }
}

export default async function CustomPage({ params }: PageProps) {
  const { slug } = await params
  const result = await getPageData(slug)
  if (!result) notFound()

  return (
    <LandingPageRenderer
      sections={result.page.sections as unknown as LandingSection[]}
      accentColor={result.tenant.primary_color}
      settings={result.page.settings as unknown as LandingPageSettings}
    />
  )
}
