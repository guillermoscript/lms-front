import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ConsentForm } from "./consent-form"

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>
}) {
  const { authorization_id } = await searchParams

  if (!authorization_id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Invalid Request</h1>
          <p className="mt-2 text-muted-foreground">Missing authorization_id parameter.</p>
        </div>
      </div>
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const returnUrl = `/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}`
    redirect(`/auth/sign-in?redirect=${encodeURIComponent(returnUrl)}`)
  }

  // Get user role
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  const userRole = roleData?.role || "student"

  if (userRole !== "teacher" && userRole !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
          <div className="mb-4 text-4xl">🚫</div>
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">
            Only teachers and admins can authorize MCP server access.
            Your current role is <strong>{userRole}</strong>.
          </p>
        </div>
      </div>
    )
  }

  // Get authorization details from Supabase OAuth server
  const { data: authDetails, error } = await (supabase.auth as any).oauth.getAuthorizationDetails(
    authorization_id
  )

  if (error || !authDetails) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Authorization Error</h1>
          <p className="mt-2 text-muted-foreground">
            {error?.message || "Could not retrieve authorization details."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 text-3xl">🔐</div>
          <h1 className="text-2xl font-bold">Authorize Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            An application is requesting access to your LMS account.
          </p>
        </div>

        <div className="mb-6 space-y-3 rounded-md border bg-muted/50 p-4">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Application</p>
            <p className="font-medium">{authDetails.client_name || "Unknown Application"}</p>
          </div>
          {authDetails.redirect_uri && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Redirect URI</p>
              <p className="truncate text-sm text-muted-foreground">{authDetails.redirect_uri}</p>
            </div>
          )}
          {authDetails.scope && (
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Permissions</p>
              <ul className="mt-1 space-y-1">
                {authDetails.scope.split(" ").map((scope: string) => (
                  <li key={scope} className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">✓</span>
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mb-4 rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Signed in as <strong>{user.email}</strong> ({userRole}).
            This will grant access to manage your LMS courses and content.
          </p>
        </div>

        <ConsentForm authorizationId={authorization_id} />
      </div>
    </div>
  )
}
