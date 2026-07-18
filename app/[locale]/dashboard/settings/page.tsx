import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenant, getCurrentUserId } from '@/lib/supabase/tenant'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/student/profile-form'
import { ConnectClaudeCard } from '@/components/dashboard/connect-claude-card'
import { ToursToggle } from '@/components/shared/tours-toggle'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getUiState } from '@/lib/supabase/ui-state'
import { areToursEnabled } from '@/lib/ui-state-keys'

// Shared settings entry point for the sidebar/user-nav links. Admins and
// students already have richer settings surfaces; teachers get their account
// settings inline here.
export default async function DashboardSettingsPage() {
  const role = await getUserRole()
  if (role === 'admin') redirect('/dashboard/admin/settings')
  if (role === 'student') redirect('/dashboard/student/profile')
  if (role !== 'teacher') redirect('/dashboard')

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  const uiState = await getUiState(userId)

  const tenant = await getCurrentTenant()
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const connectorUrl = tenant?.slug
    ? `https://${tenant.slug}.${platformDomain}/api/mcp`
    : `https://${platformDomain}/api/mcp`

  const t = await getTranslations('dashboard.accountSettings')

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('accountTitle')}</CardTitle>
            <CardDescription>{t('accountSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('preferencesTitle')}</CardTitle>
            <CardDescription>{t('preferencesSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ToursToggle initialEnabled={areToursEnabled(uiState)} />
          </CardContent>
        </Card>

        <ConnectClaudeCard connectorUrl={connectorUrl} />

        <Link href="/dashboard/teacher/api-tokens">
          <Button variant="outline">{t('manageTokens')}</Button>
        </Link>
      </div>
    </div>
  )
}
