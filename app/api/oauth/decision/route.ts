import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const body = await request.json()
  const { authorization_id, decision, tenant_id } = body

  if (!authorization_id || !decision) {
    return NextResponse.json(
      { error: "Missing authorization_id or decision" },
      { status: 400 }
    )
  }

  if (decision !== "approve" && decision !== "deny") {
    return NextResponse.json(
      { error: "Decision must be 'approve' or 'deny'" },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // All roles may connect — the MCP server's tool policy scopes what each
  // role can do; RLS enforces tenant isolation on every query.

  // Pin the tenant BEFORE approving: the token minted at the code exchange
  // carries app_metadata.tenant_id as its tenant claim, which decides which
  // school's rows RLS exposes to the connected client. Only accept tenants
  // the user is an active member of (same pattern as join-school.ts).
  if (decision === "approve" && tenant_id) {
    const adminClient = createAdminClient()

    const { data: membership } = await adminClient
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenant_id)
      .eq("status", "active")
      .maybeSingle()

    if (!membership) {
      return NextResponse.json(
        { error: "You are not an active member of the selected school." },
        { status: 403 }
      )
    }

    if (user.app_metadata?.tenant_id !== tenant_id) {
      const { error: metaError } = await adminClient.auth.admin.updateUserById(user.id, {
        app_metadata: { tenant_id },
      })
      if (metaError) {
        return NextResponse.json(
          { error: "Failed to set the school for this connection. Please try again." },
          { status: 500 }
        )
      }
      // Keep the app's preferred-tenant in sync (mirrors join-school.ts).
      await supabase.auth.updateUser({ data: { preferred_tenant_id: tenant_id } })
    }
  }

  try {
    const oauthAuth = supabase.auth.oauth
    // skipBrowserRedirect: there is no browser on the server — the SDK returns
    // redirect_url and the consent form performs the navigation client-side.
    const { data, error } =
      decision === "approve"
        ? await oauthAuth.approveAuthorization(authorization_id, { skipBrowserRedirect: true })
        : await oauthAuth.denyAuthorization(authorization_id, { skipBrowserRedirect: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ redirect_to: data.redirect_url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
