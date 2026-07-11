import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const body = await request.json()
  const { authorization_id, decision } = body

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
