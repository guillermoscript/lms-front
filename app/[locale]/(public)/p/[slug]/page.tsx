import { notFound } from 'next/navigation'
import { getCurrentTenantId, getCurrentTenant } from '@/lib/supabase/tenant'
import { createClient } from '@/lib/supabase/server'
import { PuckPageRenderer } from '@/components/public/landing-page/puck-page-renderer'
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
    .select('puck_data, name')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('status', 'published')
    .maybeSingle()

  if (!page?.puck_data || typeof page.puck_data !== 'object') return null
  return { page, tenant }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const result = await getPageData(slug)
  if (!result) return {}

  const rootProps = (result.page.puck_data as any)?.root?.props
  return {
    title: rootProps?.metaTitle || result.page.name || slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    description: rootProps?.metaDescription,
    openGraph: rootProps?.ogImage ? { images: [rootProps.ogImage] } : undefined,
  }
}

export default async function CustomPage({ params }: PageProps) {
  const { slug } = await params
  const result = await getPageData(slug)
  if (!result) notFound()

  return <PuckPageRenderer data={result.page.puck_data as any} />
}
