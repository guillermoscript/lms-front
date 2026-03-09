import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import OnboardingWizard from '@/components/onboarding/onboarding-wizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const t = await getTranslations('onboarding')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Check if user already completed onboarding
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, full_name')
    .eq('id', user.id)
    .single()

  // Get user's role in current tenant
  const tenantId = await getCurrentTenantId()
  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single()

  const role = tenantUser?.role || 'teacher'
  const redirectTo = role === 'admin' ? '/dashboard/admin' : '/dashboard/teacher'

  if (profile?.onboarding_completed) {
    redirect(redirectTo)
  }

  // Get current tenant settings
  const { data: settings } = await supabase
    .from('tenant_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['site_name', 'site_description', 'logo_url', 'primary_color', 'secondary_color'])

  const currentSettings = settings?.reduce((acc: Record<string, any>, s) => {
    acc[s.setting_key] = s.setting_value
    return acc
  }, {}) || {}

  return (
    <OnboardingWizard
      userId={user.id}
      userName={profile?.full_name || user.email?.split('@')[0] || ''}
      currentSettings={currentSettings}
      redirectTo={redirectTo}
    />
  )
}
