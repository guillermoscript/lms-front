import { createAdminClient } from '@/lib/supabase/admin'
import { PlatformPricingDisplay } from './pricing-display'

export default async function PlatformPricingPage() {
  const adminClient = await createAdminClient()

  const { data: plans } = await adminClient
    .from('platform_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return <PlatformPricingDisplay plans={plans || []} />
}
