"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"

interface McpConsentFormProps {
  sessionId: string
  userId: string
  userRole: "teacher" | "admin"
  tenantId: string
  mcpCallbackUrl: string
}

export function McpConsentForm({
  sessionId,
  userId,
  userRole,
  tenantId,
  mcpCallbackUrl,
}: McpConsentFormProps) {
  const [state, setState] = useState<"idle" | "redirecting" | "success" | "denied" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  // After redirecting, show success state (the redirect may take a moment)
  useEffect(() => {
    if (state === "redirecting") {
      const timer = setTimeout(() => setState("success"), 1500)
      return () => clearTimeout(timer)
    }
  }, [state])

  const handleApprove = () => {
    setState("redirecting")
    setError(null)

    try {
      const url = new URL(mcpCallbackUrl)
      url.searchParams.set("session_id", sessionId)
      url.searchParams.set("user_id", userId)
      url.searchParams.set("user_role", userRole)
      url.searchParams.set("tenant_id", tenantId)
      window.location.href = url.toString()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authorize")
      setState("error")
    }
  }

  const handleDeny = () => {
    setState("denied")
    window.close()
  }

  if (state === "success") {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-medium">Authorization complete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can close this window and return to Claude Desktop.
          </p>
        </div>
      </div>
    )
  }

  if (state === "denied") {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <p className="font-medium">Authorization denied</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can close this window.
          </p>
        </div>
      </div>
    )
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
        disabled={state === "redirecting"}
        className="w-full"
      >
        {state === "redirecting" ? "Authorizing..." : "Approve"}
      </Button>

      <Button
        onClick={handleDeny}
        disabled={state === "redirecting"}
        variant="outline"
        className="w-full"
      >
        Deny
      </Button>
    </div>
  )
}
