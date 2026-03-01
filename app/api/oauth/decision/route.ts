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

  // Verify user role
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  const userRole = roleData?.role || "student"

  if (userRole !== "teacher" && userRole !== "admin") {
    return NextResponse.json(
      { error: "Only teachers and admins can authorize MCP access" },
      { status: 403 }
    )
  }

  try {
    const oauthAuth = (supabase.auth as any).oauth

    if (decision === "approve") {
      const { data, error } = await oauthAuth.approveAuthorization(authorization_id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return NextResponse.json({ redirect_to: data.redirect_to })
    } else {
      const { data, error } = await oauthAuth.denyAuthorization(authorization_id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return NextResponse.json({ redirect_to: data.redirect_to })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
