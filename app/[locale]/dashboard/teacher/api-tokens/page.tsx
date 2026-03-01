import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenant } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { listMcpTokens } from '@/app/actions/mcp-tokens'
import ApiTokensPage from '@/components/dashboard/api-tokens-page'

export default async function TeacherApiTokensPage() {
  const role = await getUserRole()
  if (role !== 'teacher') {
    redirect('/dashboard/teacher')
  }

  const { data: tokens } = await listMcpTokens()
  const tenant = await getCurrentTenant()
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const mcpUrl = tenant?.slug
    ? `https://${tenant.slug}.${platformDomain}/api/mcp/cli`
    : `https://${platformDomain}/api/mcp/cli`

  return (
    <div className="p-6 lg:p-8">
      <ApiTokensPage tokens={tokens ?? []} mcpUrl={mcpUrl} />
    </div>
  )
}
