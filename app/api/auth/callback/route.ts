import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getSafeNextPath } from '@/lib/auth/safe-next-path'
import { joinSchoolPath } from '@/lib/auth/route-access'
import { joinCurrentSchool } from '@/app/actions/join-school'

/** Single-tenant fallback: the platform itself, which nobody is enrolled into. */
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

/**
 * OAuth callback route handler.
 * After the user authenticates with a social provider (e.g. Google),
 * Supabase redirects here with a `code` parameter.
 * We exchange the code for a session and redirect to the dashboard.
 *
 * This route is at /api/auth/callback to bypass the intl middleware.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = getSafeNextPath(searchParams.get('next'), '/dashboard/student')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Get session from cookie (no network call) — exchangeCodeForSession already
      // validated the token and established the session above.
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        // A social signup carries no metadata of ours (#790): `signInWithOAuth`
        // has no `options.data`, so unlike the password path there is no
        // `preferred_tenant_id` for `handle_new_user()` to stamp — the new user
        // arrives on a school subdomain with no `tenant_id` claim, which
        // `get_tenant_id()` fails closed on, and no membership. Joining here
        // writes the membership, the app_metadata claim and the preferred
        // tenant in one step, so Google reaches the destination in the same
        // number of screens as email.
        const tenantId = await getCurrentTenantId()
        if (tenantId !== DEFAULT_TENANT_ID) {
          // RLS lets a user read their own rows in any tenant ("Users can view
          // own memberships"), so this is reliable even before the claim exists.
          const { data: membership } = await supabase
            .from('tenant_users')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .maybeSingle()

          if (!membership) {
            const joined = await joinCurrentSchool()
            if (!joined.success) {
              // A genuine stop — a full seat count, a failed claim write. The
              // join page states the reason instead of dropping them on a
              // dashboard that would 404 every tenant-scoped query.
              return NextResponse.redirect(`${origin}${joinSchoolPath(next)}`)
            }
          }
        }

        let userRole = 'student'

        // Read the claims AFTER the join above: that path refreshes the session
        // precisely because the pre-join token has no tenant role to route on.
        const { data: { session: current } } = await supabase.auth.getSession()
        const accessToken = current?.access_token ?? session.access_token

        if (accessToken) {
          try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]))
            userRole = payload.tenant_role || payload.user_role || 'student'
          } catch {
            // Default to student on parse error
          }
        }

        const redirectTo = next === '/dashboard/student' ? `/dashboard/${userRole}` : next
        const forwardedHost = request.headers.get('x-forwarded-host')
        const isLocalEnv = process.env.NODE_ENV === 'development'

        if (isLocalEnv) {
          return NextResponse.redirect(`${origin}${redirectTo}`)
        } else if (forwardedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${redirectTo}`)
        } else {
          return NextResponse.redirect(`${origin}${redirectTo}`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error?error=Could+not+authenticate+with+provider`)
}
