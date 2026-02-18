import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const _next = searchParams.get('next')
  const next = _next?.startsWith('/') ? _next : '/'

  if (token_hash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    if (!error) {
      // Get tenant from current subdomain (middleware sets header)
      const tenantId = await getCurrentTenantId()

      // Update user's preferred_tenant_id to match signup subdomain
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.auth.updateUser({
          data: { preferred_tenant_id: tenantId }
        })
      }

      // Smart redirect for new signups based on context
      if (type === 'signup' && user) {
        // Check if user already has active school memberships
        const { data: memberships } = await supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .limit(1)

        if ((memberships ?? []).length > 0) {
          // Already set up → go to dashboard
          redirect('/dashboard/student')
        } else if (tenantId === DEFAULT_TENANT_ID) {
          // Main platform → prompt to create a school
          redirect('/create-school')
        } else {
          // School subdomain → join that school
          redirect('/join-school')
        }
      }

      // For recovery and other OTP types, use the next param
      redirect(next)
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${error?.message}`)
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No token hash or type`)
}
