"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface TenantMembership {
  tenantId: string
  name: string
  role: string
}

interface ConsentFormProps {
  authorizationId: string
  memberships: TenantMembership[]
  defaultTenantId?: string
}

export function ConsentForm({ authorizationId, memberships, defaultTenantId }: ConsentFormProps) {
  const [loading, setLoading] = useState<"approve" | "deny" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | undefined>(defaultTenantId)

  async function handleDecision(decision: "approve" | "deny") {
    setLoading(decision)
    setError(null)

    try {
      const res = await fetch("/api/oauth/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorization_id: authorizationId,
          decision,
          // Which school this connection is for — the minted token's tenant claim.
          ...(decision === "approve" && tenantId ? { tenant_id: tenantId } : {}),
        }),
      })

      const data = await res.json()

      if (data.redirect_to) {
        window.location.href = data.redirect_to
      } else {
        setError(data.error || "Something went wrong. Please try again.")
        setLoading(null)
      }
    } catch {
      setError("An error occurred. Please try again.")
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {memberships.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="consent-tenant">Connect to school</Label>
          <Select value={tenantId} onValueChange={(v) => v && setTenantId(v)}>
            <SelectTrigger id="consent-tenant" className="w-full">
              <SelectValue placeholder="Choose a school" />
            </SelectTrigger>
            <SelectContent>
              {memberships.map((m) => (
                <SelectItem key={m.tenantId} value={m.tenantId}>
                  {m.name} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The application will only see this school&apos;s data.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          disabled={loading !== null}
          onClick={() => handleDecision("deny")}
        >
          {loading === "deny" ? "Denying..." : "Deny"}
        </Button>
        <Button
          className="flex-1"
          disabled={loading !== null || (memberships.length > 1 && !tenantId)}
          onClick={() => handleDecision("approve")}
        >
          {loading === "approve" ? "Approving..." : "Approve"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
