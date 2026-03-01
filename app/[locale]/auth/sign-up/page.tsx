import { SignUpForm } from '@/components/sign-up-form'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function Page() {
  const tenantId = await getCurrentTenantId()

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignUpForm tenantId={tenantId} />
      </div>
    </div>
  )
}
