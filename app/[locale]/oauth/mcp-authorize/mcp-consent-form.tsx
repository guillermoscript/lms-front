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
      // POST to MCP server callback — this will redirect us
      // We use a form submission approach to follow the redirect
      const form = document.createElement("form")
      form.method = "POST"
      form.action = mcpCallbackUrl

      const fields = {
        sessionId,
        userId,
        userRole,
        tenantId,
      }

      for (const [key, value] of Object.entries(fields)) {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = key
        input.value = value
        form.appendChild(input)
      }

      document.body.appendChild(form)
      form.submit()
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
