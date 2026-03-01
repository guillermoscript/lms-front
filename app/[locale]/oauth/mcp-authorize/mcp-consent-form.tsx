"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface McpConsentFormProps {
  sessionId: string
  userId: string
  userRole: "teacher" | "admin"
  tenantId: string
  mcpCallbackUrl: string
}

/**
 * Client component for MCP OAuth consent approve/deny buttons.
 *
 * On approve: POSTs to MCP server /auth/callback with user identity.
 * The MCP server then generates an auth code and redirects the browser
 * back to the MCP client (Claude Desktop).
 *
 * On deny: Redirects back to MCP client with error=access_denied.
 */
export function McpConsentForm({
  sessionId,
  userId,
  userRole,
  tenantId,
  mcpCallbackUrl,
}: McpConsentFormProps) {
  const [loading, setLoading] = useState<"approve" | "deny" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleApprove = async () => {
    setLoading("approve")
    setError(null)

    try {
      // Redirect to MCP server callback via GET with query params
      // The callback will generate an auth code and redirect back to Claude
      const url = new URL(mcpCallbackUrl)
      url.searchParams.set("session_id", sessionId)
      url.searchParams.set("user_id", userId)
      url.searchParams.set("user_role", userRole)
      url.searchParams.set("tenant_id", tenantId)
      window.location.href = url.toString()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authorize")
      setLoading(null)
    }
  }

  const handleDeny = () => {
    setLoading("deny")
    // Close the window or show denied message
    window.close()
    // If window.close() doesn't work (not opened by script), show message
    setTimeout(() => {
      setLoading(null)
      setError("Authorization denied. You can close this window.")
    }, 500)
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <Button
        onClick={handleApprove}
        disabled={loading !== null}
        className="w-full"
      >
        {loading === "approve" ? "Authorizing..." : "Approve"}
      </Button>

      <Button
        onClick={handleDeny}
        disabled={loading !== null}
        variant="outline"
        className="w-full"
      >
        {loading === "deny" ? "Denying..." : "Deny"}
      </Button>
    </div>
  )
}
