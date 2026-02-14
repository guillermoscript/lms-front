"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface ConsentFormProps {
  authorizationId: string
}

export function ConsentForm({ authorizationId }: ConsentFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<"approve" | "deny" | null>(null)

  async function handleDecision(decision: "approve" | "deny") {
    setLoading(decision)

    try {
      const res = await fetch("/api/oauth/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorization_id: authorizationId,
          decision,
        }),
      })

      const data = await res.json()

      if (data.redirect_to) {
        window.location.href = data.redirect_to
      } else if (data.error) {
        alert(data.error)
        setLoading(null)
      }
    } catch {
      alert("An error occurred. Please try again.")
      setLoading(null)
    }
  }

  return (
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
        disabled={loading !== null}
        onClick={() => handleDecision("approve")}
      >
        {loading === "approve" ? "Approving..." : "Approve"}
      </Button>
    </div>
  )
}
