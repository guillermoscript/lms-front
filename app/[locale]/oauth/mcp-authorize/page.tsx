import { createClient } from "@/lib/supabase/server"
import { getCurrentTenantId } from "@/lib/supabase/tenant"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { McpConsentForm } from "./mcp-consent-form"

/**
 * MCP OAuth Consent Page (Multi-Tenant)
 *
 * This page is shown when Claude Desktop (or another MCP client) initiates
 * the OAuth flow. The MCP server redirects here with a session_id.
 *
 * Multi-tenant: This page runs on the tenant's subdomain (e.g.
 * school1.preciopana.com/en/oauth/mcp-authorize), so tenant context
 * is automatically resolved by proxy.ts. The callback URL uses the
 * same origin so it goes through the proxy back to the MCP server.
 *
 * Flow:
 * 1. MCP server /auth/authorize redirects here with session_id
 * 2. We check Supabase session (redirect to login if needed)
 * 3. Verify teacher/admin role in this tenant
 * 4. Show consent screen with app info
 * 5. On approve → POST to /api/mcp/auth/callback (same origin, through proxy)
 * 6. Proxy forwards to MCP server → generates auth code → redirects to Claude
 */
export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{
    session_id?: string
    client_name?: string
    scope?: string
  }>
}) {
  const { session_id, client_name, scope } = await searchParams

  if (!session_id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Invalid Request</h1>
          <p className="mt-2 text-muted-foreground">
            Missing session_id parameter. This page should be accessed via the MCP OAuth flow.
          </p>
        </div>
      </div>
    )
  }

  // Check Supabase session
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const returnUrl = `/oauth/mcp-authorize?session_id=${encodeURIComponent(session_id)}${
      client_name ? `&client_name=${encodeURIComponent(client_name)}` : ""
    }${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`
    redirect(`/auth/login?redirectTo=${encodeURIComponent(returnUrl)}`)
  }

  // Get user role from tenant_users (authoritative source)
  const tenantId = await getCurrentTenantId()
  const { data: tenantUser } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .single()

  const userRole = tenantUser?.role || "student"

  if (userRole !== "teacher" && userRole !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-muted-foreground">
            Only teachers and admins can authorize MCP server access.
            Your current role is <strong>{userRole}</strong>.
          </p>
        </div>
      </div>
    )
  }

  // Parse scopes for display
  const scopes = scope ? scope.split(" ") : ["mcp:tools"]
  const scopeDescriptions: Record<string, string> = {
    "mcp:tools": "Access LMS management tools (courses, lessons, exams, analytics)",
  }

  // Build callback URL on the SAME origin (goes through proxy → MCP server)
  // This ensures multi-tenancy works: school1.preciopana.com/api/mcp/auth/callback
  const headersList = await headers()
  const proto = headersList.get("x-forwarded-proto") || "https"
  const host = headersList.get("host") || "localhost:3000"
  const callbackUrl = `${proto}://${host}/api/mcp/auth/callback`

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-center">
            <svg
              className="h-12 w-12 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.03a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Authorize MCP Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            An application is requesting access to your LMS account via MCP.
          </p>
        </div>

        <div className="mb-6 space-y-3 rounded-md border bg-muted/50 p-4">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Application</p>
            <p className="font-medium">{client_name || "MCP Client"}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Permissions</p>
            <ul className="mt-1 space-y-1">
              {scopes.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <span className="text-green-500">&#10003;</span>
                  {scopeDescriptions[s] || s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mb-4 rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Signed in as <strong>{user.email}</strong> ({userRole}).
            This will grant access to manage your LMS courses and content.
          </p>
        </div>

        <McpConsentForm
          sessionId={session_id}
          userId={user.id}
          userRole={userRole as "teacher" | "admin"}
          tenantId={tenantId}
          mcpCallbackUrl={callbackUrl}
        />
      </div>
    </div>
  )
}
