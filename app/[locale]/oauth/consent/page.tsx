import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { redirect } from "next/navigation"
import { ConsentForm, type TenantMembership } from "./consent-form"

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
    redirect(`/auth/login?redirectTo=${encodeURIComponent(returnUrl)}`)
  }

  // Get user role
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  // All roles may connect — the MCP server's tool policy scopes what each
  // role can do (students get only self-scoped learning tools; RLS enforces
  // tenant isolation on every query). Global role is only a fallback for the
  // headline — the role that matters is the one in the connected tenant.
  const globalRole = roleData?.role || "student"

  // The tenant_id claim in the minted token decides which school's data the
  // connected client sees. Load the user's active memberships so multi-school
  // users can pick which school this connection is for. Admin client: tenant
  // names must resolve regardless of the caller's current tenant claim.
  const adminClient = createAdminClient()
  const { data: membershipRows } = await adminClient
    .from("tenant_users")
    .select("tenant_id, role, tenants(name)")
    .eq("user_id", user.id)
    .eq("status", "active")

  const memberships: TenantMembership[] = (membershipRows ?? []).map((row) => ({
    tenantId: row.tenant_id as string,
    role: (row.role as string) ?? "student",
    name:
      ((row.tenants as { name?: string } | null)?.name as string) ??
      "Unknown school",
  }))

  const currentTenantId =
    (user.app_metadata?.tenant_id as string | undefined) ??
    memberships[0]?.tenantId
  const currentTenant = memberships.find((m) => m.tenantId === currentTenantId)

  // Get authorization details from Supabase OAuth server
  const { data: authDetails, error } = await supabase.auth.oauth.getAuthorizationDetails(
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

  // Supabase short-circuits when the user already consented — go straight back
  // to the OAuth client with the authorization code.
  if ("redirect_url" in authDetails) {
    redirect(authDetails.redirect_url)
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
            <p className="font-medium">{authDetails.client?.name || "Unknown Application"}</p>
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
            Signed in as <strong>{user.email}</strong> ({currentTenant?.role ?? globalRole})
            {currentTenant && memberships.length === 1 && (
              <> — connecting to <strong>{currentTenant.name}</strong></>
            )}.
            This will let the application access your LMS data — teachers and
            admins get course management, students get their own learning tools.
          </p>
        </div>

        <ConsentForm
          authorizationId={authorization_id}
          memberships={memberships}
          defaultTenantId={currentTenantId}
        />
      </div>
    </div>
  )
}
