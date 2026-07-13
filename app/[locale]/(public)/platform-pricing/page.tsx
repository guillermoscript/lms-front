import { createAdminClient } from '@/lib/supabase/admin'
import { PlatformPricingDisplay } from './pricing-display'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'seo' })
  return buildPageMetadata({ title: t('platformPricing.title'), description: t('platformPricing.description'), path: '/platform-pricing', locale })
}

export default async function PlatformPricingPage() {
  const adminClient = await createAdminClient()

  const { data: plans } = await adminClient
    .from('platform_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return <PlatformPricingDisplay plans={plans || []} />
}
