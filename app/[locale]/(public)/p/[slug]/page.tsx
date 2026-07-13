import { notFound } from 'next/navigation'
import { getCurrentTenantId, getCurrentTenant } from '@/lib/supabase/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { PuckPageRenderer } from '@/components/public/landing-page/puck-page-renderer'
import { getLandingCourses } from '@/lib/puck/utils/landing-data'
import { ogImageUrl } from '@/lib/seo'
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

  const adminClient = createAdminClient()
  const { data: page } = await adminClient
    .from('landing_pages')
    .select('puck_data, title')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (!page?.puck_data || typeof page.puck_data !== 'object') return null
  return { page, tenant, tenantId }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const result = await getPageData(slug)
  if (!result) return {}

  const rootProps = (result.page.puck_data as any)?.root?.props
  const title =
    rootProps?.metaTitle ||
    result.page.title ||
    slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
  const description = rootProps?.metaDescription || undefined
  const image =
    rootProps?.ogImage ||
    ogImageUrl({ title, subtitle: description, site: result.tenant.name })

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function CustomPage({ params }: PageProps) {
  const { slug } = await params
  const result = await getPageData(slug)
  if (!result) notFound()

  const courses = await getLandingCourses(result.tenantId)
  return <PuckPageRenderer data={result.page.puck_data as any} courses={courses} />
}
