import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenant, getCurrentUserId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/dashboard/page-shell'
import { getUserSchools } from '@/lib/mcp/user-schools'
import ApiTokensPage from '@/components/dashboard/api-tokens-page'

export default async function TeacherApiTokensPage() {
  const role = await getUserRole()
  if (role !== 'teacher') {
    redirect('/dashboard/teacher')
  }

  const userId = await getCurrentUserId()
  const schools = userId ? await getUserSchools(userId) : []
  const tenant = await getCurrentTenant()
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const mcpUrl = tenant?.slug
    ? `https://${tenant.slug}.${platformDomain}/api/mcp`
    : `https://${platformDomain}/api/mcp`

  return (
    <PageShell variant="form">
      <ApiTokensPage mcpUrl={mcpUrl} schools={schools} />
    </PageShell>
  )
}
