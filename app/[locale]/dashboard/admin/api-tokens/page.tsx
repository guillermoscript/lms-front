import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { listMcpTokens } from '@/app/actions/mcp-tokens'
import ApiTokensPage from '@/components/dashboard/api-tokens-page'

export default async function AdminApiTokensPage() {
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  const { data: tokens } = await listMcpTokens()
  const domain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'

  return (
    <div className="p-6 lg:p-8">
      <ApiTokensPage tokens={tokens ?? []} domain={domain} />
    </div>
  )
}
