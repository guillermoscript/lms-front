import { getCurrentTenantId, getCurrentTenant } from '@/lib/supabase/tenant'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

/** True when the school has a published Puck landing (its pages then own their header/footer). */
export async function hasPuckPage(): Promise<boolean> {
  try {
    const tenantId = await getCurrentTenantId()
    if (tenantId === DEFAULT_TENANT_ID) return false
    const tenant = await getCurrentTenant()
    if (!tenant) return false
    const { data } = await createAdminClient()
      .from('landing_pages')
      .select('page_id')
      .eq('tenant_id', tenantId)
      .eq('is_published', true)
      .limit(1)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}
