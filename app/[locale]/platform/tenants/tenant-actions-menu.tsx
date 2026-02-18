"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconDotsVertical } from "@tabler/icons-react"
import { suspendTenant, forceTenantPlanChange } from "@/app/actions/platform/plans"
import { ImpersonateDialog } from "./impersonate-dialog"

interface TenantActionsMenuProps {
  tenantId: string
  tenantName: string
  currentPlan: string
  isActive: boolean
}

const PLANS = ['free', 'starter', 'pro', 'business', 'enterprise']

export function TenantActionsMenu({ tenantId, tenantName, currentPlan, isActive }: TenantActionsMenuProps) {
  const router = useRouter()
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [showImpersonate, setShowImpersonate] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(currentPlan)
  const [loading, setLoading] = useState(false)

  async function handleSuspend() {
    setLoading(true)
    try {
      await suspendTenant(tenantId, isActive)
      toast.success(isActive ? 'Tenant suspended' : 'Tenant reactivated')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePlanChange() {
    setLoading(true)
    try {
      await forceTenantPlanChange(tenantId, selectedPlan)
      toast.success('Plan updated')
      setShowPlanModal(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <IconDotsVertical className="h-4 w-4" />
          </Button>
        } />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`./tenants/${tenantId}`)}>
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowImpersonate(true)}>
            Impersonate User
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowPlanModal(true)}>
            Change Plan
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSuspend}
            className={isActive ? 'text-destructive' : 'text-green-600'}
          >
            {isActive ? 'Suspend Tenant' : 'Reactivate Tenant'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Plan Change Modal */}
      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan — {tenantName}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedPlan} onValueChange={(v) => v && setSelectedPlan(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map(p => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanModal(false)}>Cancel</Button>
            <Button onClick={handlePlanChange} disabled={loading}>
              {loading ? 'Saving…' : 'Apply Change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonate Dialog */}
      <ImpersonateDialog
        open={showImpersonate}
        onClose={() => setShowImpersonate(false)}
        tenantId={tenantId}
        tenantName={tenantName}
      />
    </>
  )
}
