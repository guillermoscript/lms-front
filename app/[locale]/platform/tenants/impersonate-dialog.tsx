"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getTenantUsersForImpersonation, impersonateUser } from "@/app/actions/platform/impersonate"
import { IconLoader } from "@tabler/icons-react"

interface User {
  user_id: string
  role: string
  full_name: string
  email: string
}

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
  tenantName: string
}

export function ImpersonateDialog({ open, onClose, tenantId, tenantName }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoadingUsers(true)
    getTenantUsersForImpersonation(tenantId)
      .then(setUsers)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingUsers(false))
  }, [open, tenantId])

  async function handleImpersonate(userId: string) {
    setImpersonating(userId)
    try {
      const { url } = await impersonateUser(userId, tenantId)
      // Open in current tab — the magic link signs the admin in as the target user
      window.location.href = url
    } catch (e: any) {
      toast.error(e.message)
      setImpersonating(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="impersonate-dialog">
        <DialogHeader>
          <DialogTitle>Impersonate User — {tenantName}</DialogTitle>
        </DialogHeader>
        <div className="py-2 max-h-80 overflow-y-auto space-y-2" data-testid="impersonate-user-list">
          {loadingUsers ? (
            <div className="flex items-center justify-center py-8" data-testid="impersonate-loading">
              <IconLoader className="animate-spin h-6 w-6 text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="impersonate-empty">No users found.</p>
          ) : (
            users.map((u) => (
              <div
                key={u.user_id}
                className="flex items-center justify-between rounded-lg border p-3"
                data-testid="impersonate-user-row"
                data-user-id={u.user_id}
                data-role={u.role}
              >
                <div>
                  <p className="font-medium text-sm">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize text-xs">{u.role}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleImpersonate(u.user_id)}
                    disabled={!!impersonating}
                    data-testid="impersonate-signin-btn"
                  >
                    {impersonating === u.user_id ? (
                      <IconLoader className="animate-spin h-3 w-3" />
                    ) : (
                      'Sign in as'
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="impersonate-cancel-btn">Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
